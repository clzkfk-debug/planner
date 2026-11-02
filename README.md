# 나의 일정 (할일 & 루틴 PWA)

빌드 과정 없이 HTML, CSS, JS만으로 만든 앱입니다. 데이터는 기기의 브라우저(localStorage)에 저장됩니다.

## 파일
- `index.html`, `styles.css`, `app.js`: 앱 본체
- `manifest.json`: 홈 화면에 설치할 때 쓰는 정보(이름, 아이콘, 색상)
- `sw.js`: 서비스 워커(오프라인 실행용). 파일을 고쳐서 다시 배포할 때는 `CACHE` 버전을 올려 주세요(`planner-v1` → `planner-v2`).
- `icons/`: 앱 아이콘

## 로컬에서 실행
```bash
python3 -m http.server 8000
```
실행한 뒤 http://localhost:8000 에 접속하세요.

## 휴대폰에 설치
PWA를 설치하려면 HTTPS 주소가 필요합니다. 이 폴더를 GitHub Pages, Netlify Drop(폴더를 끌어다 놓기), Cloudflare Pages 중 한 곳에 올리세요.
- 안드로이드(Chrome): 주소에 접속 → 메뉴 ⋮ → "홈 화면에 추가". 앱의 설정 화면에 있는 "홈 화면에 설치" 버튼을 써도 됩니다.
- 아이폰(Safari): 주소에 접속 → 공유 버튼 → "홈 화면에 추가"
