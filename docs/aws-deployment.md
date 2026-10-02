# Flay AWS 배포

운영 주소는 **https://flay.pir.kr/** 입니다.

포켓몬 게임과 같은 S3 비공개 버킷 / CloudFront OAC / HTTPS / Route 53 구성입니다. 서울의 `FlayProd` 스택에서 전용 버킷, 배포, DNS A·AAAA, GitHub 배포 Role을 관리합니다. `pir.kr` 영역과 AWS 계정의 기존 GitHub OIDC Provider를 참조합니다. 서버나 데이터베이스는 추가하지 않습니다.

인증서는 ACM `us-east-1`에서 별도로 발급하고 DNS 검증한 뒤 `infra/config.json`의 ARN으로 참조합니다. 인증서와 검증 CNAME을 유지해야 자동 갱신됩니다. 인프라 스택의 버킷은 삭제 시 보존하며 스택 종료 보호를 켰습니다.

## 자동 배포

`himinseop/flay`의 `main`에 push하면 `.github/workflows/ci.yml`이 다음을 실행합니다.

1. 나라 195개, 국기 파일, 이름·별칭과 라이선스, JavaScript 문법을 확인합니다.
2. 게임과 AWS 접근 범위·릴리스 검사 테스트를 실행합니다.
3. 이미지와 앱·스타일에 내용 해시 파일명을 붙인 정적 릴리스를 만듭니다. `COUNTRIES-LICENSE.txt`, 태극기 파비콘 및 홈 화면 아이콘도 포함합니다.
4. CloudFormation 생성 검사를 실행하고 같은 릴리스를 배포 단계에 전달합니다.
5. GitHub OIDC로 임시 자격 증명을 발급받아 전용 버킷에 올립니다. 이미지→앱/데이터→HTML 순으로 반영하며 이전 이미지 파일은 삭제하지 않습니다.
6. CloudFront 캐시를 갱신하고 완료를 기다린 뒤 HTTPS와 국가 수를 확인합니다.

PR은 배포하지 않습니다. `production` 환경은 `main` branch만 허용하고 배포를 순서대로 실행합니다. GitHub에 AWS access key를 저장하지 않습니다. 배포 Role은 이 사이트의 S3 읽기·쓰기, 이 CloudFront 캐시 갱신, 이 스택의 출력 조회만 허용합니다.

필요한 GitHub Actions Variables:

- `AWS_DEPLOY_ENABLED=true`
- `AWS_ROLE_ARN=arn:aws:iam::733625312722:role/flay-prod-github-deploy`

설정값은 `infra/config.json`에 있습니다. 실제 배포 출력은 로컬의 `exports/aws-outputs.json`으로 저장하며 Git에 포함하지 않습니다.

## 인프라 변경

```sh
npm ci
npm run ci
aws sso login --profile podbbangcast
npm run aws:diff -- --profile podbbangcast
npm run aws:deploy -- --profile podbbangcast
```

인프라 변경은 로컬에서 diff를 검토한 뒤 적용합니다. GitHub의 배포 Role은 인프라 변경 권한이 없습니다. 사이트 복구는 정상 commit으로 revert하여 `main`에 push합니다.

CloudFront는 기존 포켓몬과 같은 `PRICE_CLASS_200` 종량제를 사용합니다. 추가 호스팅 영역과 유료 액세스 로그를 만들지 않고, 국기를 1년 immutable 캐시로 제공하며 데이터·HTML은 갱신 확인하도록 제공합니다. 기존 계정 무료 범위와 실제 전송량에 따라 비용이 발생합니다.

랭킹은 브라우저에 저장합니다. localhost나 다른 도메인의 기록이 `flay.pir.kr`로 자동 이전되지는 않습니다.
