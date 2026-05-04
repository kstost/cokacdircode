import { SectionTitle, SubSection, StepList, StepItem, P, IC, InfoBox } from '../DocComponents'
import { useLanguage } from '../../LanguageContext'

export default function SlackBotSetup() {
  const { t } = useLanguage()

  return (
    <div>
      <SectionTitle>{t('Slack Bot Setup', 'Slack 봇 설정')}</SectionTitle>
      <P>
        {t(
          <>Create a Slack app with <strong>Socket Mode</strong> enabled and connect it to cokacdir. Slack uses a token pair: a bot token (<IC>xoxb-...</IC>) and an app-level token (<IC>xapp-...</IC>).</>,
          <>Slack 앱을 만들고 <strong>Socket Mode</strong>를 활성화한 뒤 cokacdir에 연결하세요. Slack은 봇 토큰(<IC>xoxb-...</IC>)과 앱 레벨 토큰(<IC>xapp-...</IC>) 두 개를 함께 사용합니다.</>
        )}
      </P>

      <SubSection title={String(t('1. Create a Slack App', '1. Slack 앱 생성'))}>
        <StepList>
          <StepItem number={1}>
            {t(
              <>Go to <strong>Slack API Apps</strong> (api.slack.com/apps) and click <strong>Create New App</strong>.</>,
              <><strong>Slack API Apps</strong>(api.slack.com/apps)로 이동한 뒤 <strong>Create New App</strong>을 클릭합니다.</>
            )}
          </StepItem>
          <StepItem number={2}>
            {t(
              <>Choose <strong>From scratch</strong>, set an app name, and select the workspace where you will use the bot.</>,
              <><strong>From scratch</strong>를 선택하고 앱 이름을 입력한 뒤 봇을 사용할 워크스페이스를 선택합니다.</>
            )}
          </StepItem>
        </StepList>
      </SubSection>

      <SubSection title={String(t('2. Enable Socket Mode', '2. Socket Mode 활성화'))}>
        <StepList>
          <StepItem number={1}>
            {t(
              <>Open <strong>Socket Mode</strong> from the left sidebar.</>,
              <>왼쪽 사이드바에서 <strong>Socket Mode</strong>를 엽니다.</>
            )}
          </StepItem>
          <StepItem number={2}>
            {t(
              <>Turn <strong>Enable Socket Mode</strong> on.</>,
              <><strong>Enable Socket Mode</strong>를 켭니다.</>
            )}
          </StepItem>
          <StepItem number={3}>
            {t(
              <>When prompted, generate an <strong>App-Level Token</strong> with the <IC>connections:write</IC> scope. Copy the <IC>xapp-...</IC> token.</>,
              <>안내가 표시되면 <IC>connections:write</IC> scope를 가진 <strong>App-Level Token</strong>을 생성하고 <IC>xapp-...</IC> 토큰을 복사합니다.</>
            )}
          </StepItem>
        </StepList>
        <InfoBox type="info">
          {t(
            <>Socket Mode lets Slack deliver events over a WebSocket, so you do not need to expose a public HTTP endpoint.</>,
            <>Socket Mode를 사용하면 Slack 이벤트를 WebSocket으로 받을 수 있어 공개 HTTP 엔드포인트를 열 필요가 없습니다.</>
          )}
        </InfoBox>
      </SubSection>

      <SubSection title={String(t('3. Enable Direct Messages', '3. DM 메시지 활성화'))}>
        <StepList>
          <StepItem number={1}>
            {t(
              <>Open <strong>App Home</strong>, then enable the <strong>Messages Tab</strong>.</>,
              <><strong>App Home</strong>을 열고 <strong>Messages Tab</strong>을 활성화합니다.</>
            )}
          </StepItem>
          <StepItem number={2}>
            {t(
              <>Allow users to send messages to the app. This is required for reliable 1:1 DM use together with the <IC>message.im</IC> event.</>,
              <>사용자가 앱에 메시지를 보낼 수 있도록 허용합니다. <IC>message.im</IC> 이벤트와 함께 1:1 DM을 안정적으로 사용하려면 필요합니다.</>
            )}
          </StepItem>
        </StepList>
      </SubSection>

      <SubSection title={String(t('4. Configure Bot Scopes', '4. 봇 scope 설정'))}>
        <P>
          {t(
            <>Open <strong>OAuth & Permissions</strong> and add these <strong>Bot Token Scopes</strong>:</>,
            <><strong>OAuth & Permissions</strong>를 열고 다음 <strong>Bot Token Scopes</strong>를 추가합니다.</>
          )}
        </P>
        <ul className="list-disc list-inside mt-1 space-y-1">
          <li><IC>app_mentions:read</IC></li>
          <li><IC>channels:history</IC></li>
          <li><IC>chat:write</IC></li>
          <li><IC>files:read</IC></li>
          <li><IC>files:write</IC></li>
          <li><IC>groups:history</IC></li>
          <li><IC>im:history</IC></li>
          <li><IC>im:read</IC></li>
          <li><IC>im:write</IC></li>
          <li><IC>mpim:history</IC> ({t('optional, for group DMs', '선택, 그룹 DM용')})</li>
          <li><IC>users:read</IC></li>
        </ul>
      </SubSection>

      <SubSection title={String(t('5. Subscribe to Events', '5. 이벤트 구독 설정'))}>
        <StepList>
          <StepItem number={1}>
            {t(
              <>Open <strong>Event Subscriptions</strong> and turn it on.</>,
              <><strong>Event Subscriptions</strong>를 열고 활성화합니다.</>
            )}
          </StepItem>
          <StepItem number={2} title={String(t('Subscribe to bot events:', '봇 이벤트 구독:'))}>
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li><IC>app_mention</IC></li>
              <li><IC>message.im</IC></li>
              <li><IC>message.channels</IC> ({t('optional, only if the bot should read all channel messages', '선택, 봇이 채널의 모든 메시지를 읽어야 할 때만')})</li>
              <li><IC>message.groups</IC> ({t('optional, for private channels', '선택, 비공개 채널용')})</li>
              <li><IC>message.mpim</IC> ({t('optional, for group DMs', '선택, 그룹 DM용')})</li>
            </ul>
          </StepItem>
        </StepList>
        <InfoBox type="warning">
          {t(
            <>Subscribe to the matching <IC>message.*</IC> event for every Slack surface you use. Channel file uploads rely on the channel message event as a fallback to map Slack file-share timestamps for later edit/delete operations.</>,
            <>사용할 Slack 대화 유형마다 알맞은 <IC>message.*</IC> 이벤트를 구독하세요. 채널 파일 업로드는 이후 수정/삭제에 필요한 Slack file-share timestamp 매핑을 위해 채널 메시지 이벤트를 fallback으로 사용합니다.</>
          )}
        </InfoBox>
        <InfoBox type="warning">
          {t(
            <>If you subscribe to both <IC>app_mention</IC> and <IC>message.channels</IC>, Slack may emit two events for the same mention. cokacdir deduplicates them by Slack timestamp, but subscribing only to the events you need keeps the app quieter.</>,
            <><IC>app_mention</IC>과 <IC>message.channels</IC>를 모두 구독하면 같은 멘션에 대해 이벤트가 두 번 올 수 있습니다. cokacdir은 Slack timestamp 기준으로 중복을 제거하지만, 필요한 이벤트만 구독하는 편이 더 깔끔합니다.</>
          )}
        </InfoBox>
      </SubSection>

      <SubSection title={String(t('6. Install the App and Get the Bot Token', '6. 앱 설치 및 봇 토큰 발급'))}>
        <StepList>
          <StepItem number={1}>
            {t(
              <>Back in <strong>OAuth & Permissions</strong>, click <strong>Install to Workspace</strong>.</>,
              <><strong>OAuth & Permissions</strong>로 돌아가 <strong>Install to Workspace</strong>를 클릭합니다.</>
            )}
          </StepItem>
          <StepItem number={2}>
            {t(
              <>Approve the permissions, then copy the <strong>Bot User OAuth Token</strong> (<IC>xoxb-...</IC>).</>,
              <>권한을 승인한 뒤 <strong>Bot User OAuth Token</strong>(<IC>xoxb-...</IC>)을 복사합니다.</>
            )}
          </StepItem>
        </StepList>
      </SubSection>

      <SubSection title={String(t('7. Invite the Bot to a Channel', '7. 채널에 봇 초대'))}>
        <P>
          {t(
            <>In Slack, open the channel where you want to use the bot and invite it with <IC>/invite @your-bot-name</IC>. For DMs, send the bot a direct message.</>,
            <>Slack에서 봇을 사용할 채널을 열고 <IC>/invite @your-bot-name</IC>으로 초대합니다. DM에서는 봇에게 직접 메시지를 보내면 됩니다.</>
          )}
        </P>
      </SubSection>

      <SubSection title={String(t('8. Register Tokens in cokacdir', '8. cokacdir에 토큰 등록'))}>
        <StepList>
          <StepItem number={1}>{t(<>Run <IC>cokacctl</IC>.</>, <><IC>cokacctl</IC>을 실행합니다.</>)}</StepItem>
          <StepItem number={2}>{t(<>Press <IC>k</IC> to open the token input screen.</>, <><IC>k</IC>를 눌러 토큰 입력 화면을 엽니다.</>)}</StepItem>
          <StepItem number={3}>
            {t(
              <>Paste the token pair as <IC>slack:xoxb-...,xapp-...</IC> (or <IC>xoxb-...,xapp-...</IC> for auto-detect) and press Enter.</>,
              <>토큰 쌍을 <IC>slack:xoxb-...,xapp-...</IC> 형식으로 붙여넣고 Enter를 누릅니다. 자동 감지를 원하면 <IC>xoxb-...,xapp-...</IC> 형식도 사용할 수 있습니다.</>
            )}
          </StepItem>
        </StepList>
        <InfoBox type="info">
          {t(
            <>Either order works: cokacdir parses both <IC>xoxb-...,xapp-...</IC> and <IC>xapp-...,xoxb-...</IC>.</>,
            <>순서는 바뀌어도 됩니다. cokacdir은 <IC>xoxb-...,xapp-...</IC>와 <IC>xapp-...,xoxb-...</IC>를 모두 인식합니다.</>
          )}
        </InfoBox>
      </SubSection>
    </div>
  )
}
