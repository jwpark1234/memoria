# Memoria

가볍고 빠른 동기화 메모 위젯.

- **데스크톱(Windows/macOS/Ubuntu)**: Tauri 2. 테두리 없는 작은 창
  - 창을 닫으면 트레이로 숨고, 완전히 끄려면 트레이 메뉴의 "종료"를 누릅니다. 트레이 아이콘 왼쪽 클릭으로 열기/숨기기를 하고, Ubuntu에서는 메뉴로 합니다.
  - 타이틀바의 설정 버튼으로 투명도(30~100%)와 위치(자유, 또는 좌상단·우상단·좌하단·우하단 고정)를 정합니다. 고정 중에는 끌어서 옮길 수 없습니다.
  - 핀 버튼으로 항상 위에 표시를 켜고 끕니다. 설정은 기기별로 저장됩니다.
- **모바일**: PWA (홈 화면에 추가)
- **동기화**: Firestore 실시간 동기화 + 오프라인 캐시. 입력은 즉시 로컬에 반영되고, 서버에는 입력이 멈춘 뒤 0.6초 후 저장
- **로그인**: Google 계정 (Firebase Auth)

하단 상태줄에 동기화 상태가 표시됩니다. 입력 중(회색) → 업로드 중(노랑) → 동기화됨(초록), 오프라인(빨강)일 때는 연결되면 자동으로 업로드됩니다.

## 설치

- **모바일(PWA)**: https://memoria-6104d.web.app
  - 휴대폰·태블릿 전용입니다. PC 브라우저로 접속하면 데스크톱 앱 안내만 나옵니다.
  - iPhone: Safari로 접속 → 공유 → "홈 화면에 추가"
  - Android: Chrome으로 접속 → 메뉴 → "앱 설치"
  - Firebase Hosting(Google 서버)에서 제공되므로 개발 PC가 꺼져 있어도 접속됩니다.
- **데스크톱**: [GitHub Releases](https://github.com/jwpark1234/memoria/releases/latest)에서 OS에 맞는 설치 파일을 받습니다.
  - Windows: `Memoria_x.y.z_x64-setup.exe` / macOS: `Memoria_x.y.z_universal.dmg` / Ubuntu: `.deb` 또는 `.AppImage`

## 개발 환경

- Node.js 20.19+ (권장 22 LTS)
- Rust (rustup)
- Windows: Visual Studio Build Tools의 "C++를 사용한 데스크톱 개발" 워크로드 / macOS: `xcode-select --install`
- Ubuntu: `sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf build-essential`

## 1. Firebase 설정

1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트를 만듭니다.
2. **Firestore Database**를 생성합니다. 위치는 `asia-northeast3 (서울)`로 선택하고, 프로덕션 모드로 시작합니다.
3. **Authentication**에서 로그인 방법으로 **Google**을 사용 설정합니다.
4. **프로젝트 설정 → 내 앱**에서 웹 앱을 추가하고, 표시되는 설정값을 `.env`에 넣습니다.
5. 보안 규칙을 배포합니다: `npx firebase-tools deploy --only firestore:rules`

## 2. 데스크톱 로그인용 OAuth 클라이언트

1. [Google Cloud 콘솔](https://console.cloud.google.com)에서 **Firebase와 같은 프로젝트**를 선택합니다.
2. **API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트 ID 만들기**를 누르고, 유형은 **데스크톱 앱**으로 고릅니다.
3. 발급된 ID와 secret을 `.env`의 `VITE_GOOGLE_DESKTOP_CLIENT_ID`, `VITE_GOOGLE_DESKTOP_CLIENT_SECRET`에 넣습니다.

데스크톱 앱에서는 WebView 안에서 Firebase 팝업 로그인을 쓸 수 없습니다. 그래서 시스템 브라우저로 OAuth(PKCE + loopback)를 진행하고, 받은 토큰으로 Firebase에 로그인합니다. 구현은 `src-tauri/src/oauth.rs`에 있습니다.

## 3. 실행

```sh
cp .env.example .env   # 값 채우기
npm install
npm run icons          # public/icon.svg → PWA 아이콘 + src-tauri/icons 생성 (최초 1회)

npm run dev            # 브라우저(PWA)로 개발
npm run tauri dev      # 데스크톱 위젯으로 개발
```

## 4. 배포

- **데스크톱**: `npm run tauri build`를 실행하면 `src-tauri/target/release/bundle/`에 그 OS용 설치 파일이 생성됩니다.
  - macOS와 Ubuntu용은 그 OS에서 빌드해야 합니다. 대신 GitHub Actions(`.github/workflows/release.yml`)로 세 OS를 한 번에 빌드할 수 있습니다.
    - 저장소 Secrets에 `.env.local`의 6개 값을 같은 이름으로 등록합니다.
    - `v0.1.0` 같은 태그를 푸시하면 Releases에 설치 파일 초안이 생깁니다.
  - **자동 업데이트**: 설치된 앱은 1시간마다 Releases의 `latest.json`을 확인하고, 새 버전이 있으면 제목 옆에 업데이트 버튼을 띄웁니다.
    - 새 버전을 낼 때는 `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`의 버전을 함께 올리고 태그를 푸시한 뒤, 초안을 **게시(Publish)** 합니다.
    - 업데이트 파일은 `~/.tauri/memoria.key`로 서명합니다. 이 파일의 내용을 저장소 Secrets에 `TAURI_SIGNING_PRIVATE_KEY`로 등록합니다. 키를 잃어버리면 이미 설치된 앱은 더 이상 자동 업데이트를 받을 수 없으니 따로 백업해 둡니다.
    - 로컬에서 `npm run tauri build`를 할 때도 같은 키가 필요합니다: `TAURI_SIGNING_PRIVATE_KEY_PATH=~/.tauri/memoria.key`
  - 서명하지 않은 빌드라서 처음 실행할 때 경고가 뜹니다.
    - Windows: SmartScreen에서 "추가 정보 → 실행"
    - macOS: 앱을 우클릭 → 열기. "손상됨"이라고 나오면 `xattr -cr /Applications/Memoria.app`
- **PWA**: `npm run build && npx firebase-tools deploy --only hosting --project staging`을 실행하면 https://memoria-6104d.web.app 에 배포됩니다.
  - `npm run tauri build`가 `dist`를 데스크톱용으로 덮어쓰므로, 배포 직전에 반드시 `npm run build`를 다시 실행합니다.
  - 배포한 도메인(`<project>.web.app` 등)을 Firebase Authentication → 설정 → **승인된 도메인**에 추가해야 합니다.
  - 휴대폰 브라우저에서 접속한 뒤 "홈 화면에 추가"를 누릅니다.
  - 새로 배포하면 열려 있는 앱이 이를 알아채고 제목 옆에 업데이트 버튼을 띄웁니다. 누르면 새 버전으로 다시 불러옵니다.

## 데이터 구조

```
users/{uid}/notes/{noteId}
  text: string
  color: 'yellow' | 'orange' | 'pink' | 'purple' | 'blue' | 'green'
  pinned: boolean
  deleted: boolean        # 삭제 시 바로 지우지 않고 플래그만 세움 (기기 간 동기화 안정성)
  createdAt, updatedAt: serverTimestamp
```

## 단축키

- `Ctrl/⌘ + N`: 새 메모
- `Ctrl/⌘ + F`: 검색 (검색창에서 `Esc`로 닫기)
- `Esc`: 목록으로 (빈 메모는 자동 삭제)
