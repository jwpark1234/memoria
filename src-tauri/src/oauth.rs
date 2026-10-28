//! 데스크톱용 Google 로그인.
//!
//! WebView 안에서는 Firebase 팝업 로그인을 쓸 수 없으므로(origin이 tauri://localhost 등)
//! 시스템 브라우저로 OAuth(PKCE + loopback redirect)를 진행하고, 받은 토큰을 프론트로 넘겨
//! `signInWithCredential`로 Firebase에 로그인한다.

use std::time::Duration;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use url::Url;

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);
const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Memoria</title>\
<body style=\"font:16px system-ui;text-align:center;padding-top:20vh\">\
이 창을 닫고 Memoria로 돌아가세요.</body>";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleTokens {
    id_token: String,
    access_token: String,
}

#[derive(Deserialize)]
struct TokenResponse {
    id_token: String,
    access_token: String,
}

fn random_token(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::rng().fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

#[tauri::command]
pub async fn google_sign_in(
    app: AppHandle,
    client_id: String,
    client_secret: String,
) -> Result<GoogleTokens, String> {
    let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://127.0.0.1:{port}");

    let verifier = random_token(32);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = random_token(16);

    let auth_url = Url::parse_with_params(
        AUTH_URL,
        &[
            ("client_id", client_id.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("response_type", "code"),
            ("scope", "openid email profile"),
            ("code_challenge", challenge.as_str()),
            ("code_challenge_method", "S256"),
            ("state", state.as_str()),
            ("prompt", "select_account"),
        ],
    )
    .map_err(|e| e.to_string())?;
    app.opener()
        .open_url(auth_url.as_str(), None::<&str>)
        .map_err(|e| e.to_string())?;

    let code = tokio::time::timeout(LOGIN_TIMEOUT, wait_for_code(&listener, &state))
        .await
        .map_err(|_| "로그인 시간이 초과되었습니다.".to_string())??;

    let res = reqwest::Client::new()
        .post(TOKEN_URL)
        .form(&[
            ("code", code.as_str()),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("code_verifier", verifier.as_str()),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|e| e.to_string()));
    }
    let tokens: TokenResponse = res.json().await.map_err(|e| e.to_string())?;

    Ok(GoogleTokens {
        id_token: tokens.id_token,
        access_token: tokens.access_token,
    })
}

/// 브라우저가 redirect_uri로 돌아올 때까지 기다렸다가 인가 코드를 꺼낸다.
async fn wait_for_code(listener: &TcpListener, state: &str) -> Result<String, String> {
    loop {
        let (mut stream, _) = listener.accept().await.map_err(|e| e.to_string())?;
        let mut buf = [0u8; 8192];
        let n = stream.read(&mut buf).await.map_err(|e| e.to_string())?;
        let request = String::from_utf8_lossy(&buf[..n]);

        let Some(path) = request.lines().next().and_then(|l| l.split_whitespace().nth(1)) else {
            continue;
        };
        let Ok(url) = Url::parse(&format!("http://127.0.0.1{path}")) else {
            continue;
        };
        let param = |key: &str| {
            url.query_pairs()
                .find(|(k, _)| k == key)
                .map(|(_, v)| v.into_owned())
        };

        // favicon 등 OAuth와 무관한 요청은 무시
        if param("code").is_none() && param("error").is_none() {
            let _ = stream
                .write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                .await;
            continue;
        }

        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{DONE_PAGE}",
            DONE_PAGE.len()
        );
        let _ = stream.write_all(response.as_bytes()).await;

        if let Some(err) = param("error") {
            return Err(format!("로그인이 취소되었거나 실패했습니다: {err}"));
        }
        if param("state").as_deref() != Some(state) {
            return Err("로그인 응답이 올바르지 않습니다(state 불일치).".into());
        }
        return param("code").ok_or_else(|| "인가 코드가 없습니다.".into());
    }
}
