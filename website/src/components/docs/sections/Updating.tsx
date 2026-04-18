import { SectionTitle, SubSection, P, IC, CodeBlock, InfoBox } from '../DocComponents'
import { useLanguage } from '../../LanguageContext'

export default function Updating() {
  const { t } = useLanguage()
  return (
    <div>
      <SectionTitle>{t('Updating', '업데이트')}</SectionTitle>
      <P>
        {t(
          <>Run the command for the environment where cokacdir is installed. The cokacctl dashboard will open — press <IC>u</IC> to update to the latest version.</>,
          <>cokacdir이 설치된 환경에 맞는 명령어를 실행하세요. cokacctl 대시보드가 열리면 <IC>u</IC>를 눌러 최신 버전으로 업데이트합니다.</>
        )}
      </P>

      <SubSection title={String(t('Installed on macOS / Linux', 'macOS / Linux에 설치한 경우'))}>
        <CodeBlock code="cokacctl" />
        <P>
          {t(
            <>Press <IC>u</IC> in the dashboard to update.</>,
            <>대시보드에서 <IC>u</IC>를 눌러 업데이트합니다.</>
          )}
        </P>
      </SubSection>

      <SubSection title={String(t('Installed on Windows', 'Windows에 설치한 경우'))}>
        <CodeBlock code="cokacctl" />
        <P>
          {t(
            <>Press <IC>u</IC> in the dashboard to update.</>,
            <>대시보드에서 <IC>u</IC>를 눌러 업데이트합니다.</>
          )}
        </P>
      </SubSection>

      <SubSection title={String(t('Installed on AWS EC2', 'AWS EC2에 설치한 경우'))}>
        <P>
          {t(
            'Connect to your EC2 via SSH to open the cokacctl dashboard. Run the command below from the computer you used during installation.',
            'SSH로 EC2에 접속하여 cokacctl 대시보드를 엽니다. 설치 시 사용했던 컴퓨터에서 아래 명령어를 실행하세요.'
          )}
        </P>
        <div className="mt-4 mb-2 text-white font-semibold">macOS</div>
        <P>
          {t(
            <>Open a terminal in the <strong className="text-white">credential</strong> folder where <IC>secret.pem</IC> is located. (Right-click the folder → <strong className="text-white">Services</strong> → <strong className="text-white">New Terminal at Folder</strong>)</>,
            <><IC>secret.pem</IC> 파일이 들어 있는 <strong className="text-white">credential</strong> 폴더에서 터미널을 엽니다. (폴더 우클릭 → <strong className="text-white">Services</strong> → <strong className="text-white">New Terminal at Folder</strong>)</>
          )}
        </P>
        <CodeBlock code={`export PEM=secret.pem
export IP=0.0.0.0
ssh -t -i "$PEM" ubuntu@$IP "bash -ic \\"cokacctl\\""` } />
        <div className="mt-4 mb-2 text-white font-semibold">Windows</div>
        <P>
          {t(
            <>Open a terminal in the <strong className="text-white">credential</strong> folder where <IC>secret.pem</IC> is located. (Right-click the folder → <strong className="text-white">Open in Terminal</strong>)</>,
            <><IC>secret.pem</IC> 파일이 들어 있는 <strong className="text-white">credential</strong> 폴더에서 터미널을 엽니다. (폴더 우클릭 → <strong className="text-white">터미널에서 열기</strong>)</>
          )}
        </P>
        <CodeBlock code={`$PEM = "secret.pem"; \`
$IP = "0.0.0.0"; \`
ssh -t -i $PEM ubuntu@$IP "bash -ic 'cokacctl'"` } />
        <InfoBox type="info">
          {t(
            <>Replace <IC>secret.pem</IC> with your PEM file name and <IC>0.0.0.0</IC> with your EC2 Public IPv4 address. Once the dashboard opens, press <IC>u</IC> to update.</>,
            <><IC>secret.pem</IC>을 본인의 PEM 파일 이름으로, <IC>0.0.0.0</IC>을 EC2 퍼블릭 IPv4 주소로 바꿔 넣으세요. 대시보드가 열리면 <IC>u</IC>를 눌러 업데이트합니다.</>
          )}
        </InfoBox>
      </SubSection>
    </div>
  )
}
