import { SectionTitle, SubSection, P, IC, InfoBox, CommandTable, CodeBlock, UL, StepList, StepItem } from '../DocComponents'
import { useLanguage } from '../../LanguageContext'

export default function GroupChat() {
  const { t } = useLanguage()
  return (
    <div>
      <SectionTitle>{t('Group Chat', '그룹 채팅')}</SectionTitle>
      <P>{t(
        'Use multiple bots in group chats with coordinated collaboration. Each bot runs its own session and working directory, while a shared chat log lets them see what the other bots are doing.',
        '그룹 채팅에서 여러 봇을 사용하여 협업하세요. 각 봇은 자신의 세션과 작업 디렉토리를 독립적으로 갖고, 공유 채팅 로그를 통해 다른 봇이 무엇을 하고 있는지 볼 수 있습니다.'
      )}</P>

      <SubSection title={String(t('⚠ Required: Let the Bot Read Group Messages', '⚠ 필수: 봇이 그룹 메시지를 읽도록 설정'))}>
        <InfoBox type="warning">
          {t(
            <><strong>Before using any bot in a group chat (or channel), you MUST allow it to read group messages on the platform side.</strong> This is a one-time setup per bot, but it is mandatory — group chat features will silently fail without it. The exact step depends on the platform.</>,
            <><strong>그룹 채팅(또는 채널)에서 봇을 사용하기 전에, 플랫폼 측에서 봇이 그룹 메시지를 읽을 수 있도록 반드시 허용해야 합니다.</strong> 봇마다 한 번만 하면 되지만 필수입니다 — 이 설정 없이는 그룹 채팅 기능이 조용히 실패합니다. 정확한 단계는 플랫폼마다 다릅니다.</>
          )}
        </InfoBox>
        <ul className="list-disc list-inside space-y-1.5 text-zinc-400 my-4 ml-2">
          <li>{t(<><strong className="text-zinc-300">Telegram:</strong> disable privacy mode in BotFather (steps below).</>, <><strong className="text-zinc-300">Telegram:</strong> BotFather에서 프라이버시 모드 비활성화 (아래 단계 참고).</>)}</li>
          <li>{t(<><strong className="text-zinc-300">Discord:</strong> turn on the <IC>MESSAGE CONTENT</IC> intent on the Discord Developer Portal — see the Discord Bot Setup guide.</>, <><strong className="text-zinc-300">Discord:</strong> Discord Developer Portal에서 <IC>MESSAGE CONTENT</IC> intent를 켭니다 — Discord Bot Setup 가이드 참고.</>)}</li>
          <li>{t(<><strong className="text-zinc-300">Slack:</strong> subscribe to <IC>message.channels</IC> (and <IC>message.groups</IC> for private channels) in Event Subscriptions, and invite the bot to the channel — see the Slack Bot Setup guide.</>, <><strong className="text-zinc-300">Slack:</strong> Event Subscriptions에서 <IC>message.channels</IC>(비공개 채널은 <IC>message.groups</IC>도 함께)를 구독하고, 채널에 봇을 초대합니다 — Slack Bot Setup 가이드 참고.</>)}</li>
        </ul>
        <h3 className="text-lg font-semibold text-white mt-6 mb-3">
          {t('Telegram: Disable Privacy Mode in BotFather', 'Telegram: BotFather에서 프라이버시 모드 비활성화')}
        </h3>
        <P>{t(
          'By default, Telegram bots run in "privacy mode," which means the bot only receives:',
          '기본적으로 Telegram 봇은 "프라이버시 모드"로 동작하며, 이 경우 봇은 다음 메시지만 수신합니다:'
        )}</P>
        <UL>
          <li>{t(<>Messages that start with a <IC>/</IC> command</>, <><IC>/</IC> 명령으로 시작하는 메시지</>)}</li>
          <li>{t(<>Messages that directly reply to one of the bot's own messages</>, <>봇 자신의 메시지에 직접 답장한 메시지</>)}</li>
          <li>{t(<>Messages that explicitly <IC>@mention</IC> the bot</>, <>봇을 <IC>@mention</IC>으로 명시적으로 언급한 메시지</>)}</li>
        </UL>
        <P>{t(
          <>With privacy mode enabled, the bot will <strong>not</strong> receive regular group messages — including messages prefixed with <IC>;</IC> (AI prompts) or <IC>!</IC> (shell commands) — so the features described on this page will silently fail.</>,
          <>프라이버시 모드가 켜져 있으면 봇은 일반 그룹 메시지를 <strong>수신하지 않습니다</strong> — <IC>;</IC>(AI 프롬프트)나 <IC>!</IC>(쉘 명령) 프리픽스가 붙은 메시지도 포함입니다 — 따라서 이 페이지에 설명된 기능들이 조용히 실패합니다.</>
        )}</P>
        <StepList>
          <StepItem number={1}>{t(<>Open Telegram and go to <IC>@BotFather</IC></>, <>Telegram을 열고 <IC>@BotFather</IC>로 이동</>)}</StepItem>
          <StepItem number={2}>{t(<>Send <IC>/setprivacy</IC></>, <><IC>/setprivacy</IC>를 전송</>)}</StepItem>
          <StepItem number={3}>{t('Select the bot you want to configure', '설정할 봇 선택')}</StepItem>
          <StepItem number={4}>{t(<>Choose <strong>Disable</strong></>, <><strong>Disable</strong> 선택</>)}</StepItem>
          <StepItem number={5}>{t(<>Repeat for <strong>every bot</strong> you plan to use in a group chat</>, <>그룹 채팅에서 사용할 <strong>모든 봇</strong>에 대해 반복</>)}</StepItem>
        </StepList>
        <InfoBox type="info">
          {t(
            'After disabling privacy mode, remove the bot from any existing group chats and re-add it, or the change may not take effect for that chat.',
            '프라이버시 모드를 비활성화한 후에는, 기존 그룹 채팅에서 봇을 제거했다가 다시 초대해야 해당 그룹에 변경이 반영될 수 있습니다.'
          )}
        </InfoBox>
      </SubSection>

      <SubSection title={String(t('Message Delivery', '메시지 전달'))}>
        <P>{t(
          'In group chats, bots don\'t listen to every message by default. Use these methods to address them — they work the same way on Telegram, Discord, and Slack:',
          '그룹 채팅에서 봇은 기본적으로 모든 메시지를 수신하지 않습니다. 다음 방법으로 봇에게 메시지를 전달하세요 — Telegram, Discord, Slack에서 동일하게 동작합니다:'
        )}</P>
        <CommandTable
          headers={[String(t('Method', '방법')), String(t('Example', '예시')), String(t('Who Receives', '수신 대상'))]}
          rows={[
            [
              String(t('Semicolon prefix', '세미콜론 접두사')),
              <IC key="1">; check the server status</IC>,
              String(t('All bots in the group', '그룹의 모든 봇')),
            ],
            [
              '@mention',
              <IC key="2">@mybot check status</IC>,
              String(t('Only the mentioned bot (recommended)', '언급된 봇만 (권장)')),
            ],
            [
              '/query',
              <IC key="3">/query check status</IC>,
              String(t('All bots or specific with /query@mybot', '모든 봇 또는 /query@mybot으로 특정 봇')),
            ],
          ]}
        />
        <InfoBox type="tip">
          {t(
            <>Use <IC>@botname</IC> to target a specific bot. This avoids duplicate responses from multiple bots.</>,
            <><IC>@botname</IC>으로 특정 봇을 지정하세요. 여러 봇의 중복 응답을 방지합니다.</>
          )}
        </InfoBox>
      </SubSection>

      <SubSection title="/public">
        <P>{t('Control who can use the bot in a group chat:', '그룹 채팅에서 봇을 사용할 수 있는 사람을 제어합니다:')}</P>
        <CommandTable
          headers={[String(t('Command', '명령어')), String(t('Description', '설명'))]}
          rows={[
            ['/public on', String(t('All group members can use the bot', '모든 그룹 멤버가 봇을 사용 가능'))],
            ['/public off', String(t('Only the owner can use the bot (default)', '소유자만 봇 사용 가능 (기본값)'))],
            ['/public', String(t('Show current setting', '현재 설정 표시'))],
          ]}
        />
        <P>{t('Only the owner can change this setting.', '소유자만 이 설정을 변경할 수 있습니다.')}</P>
      </SubSection>

      <SubSection title={String(t('/contextlevel — Controlling Shared Awareness', '/contextlevel — 공유 인식 제어'))}>
        <P>{t(
          <>In a group chat, each bot only sees its <strong>own</strong> conversation history by default — Telegram does not let one bot read another bot's messages. To solve this, the server maintains a <strong>shared chat log</strong> that records every message handled by every bot in the group (both the user requests they received and the responses they produced).</>,
          <>그룹 채팅에서 각 봇은 기본적으로 <strong>자신의</strong> 대화 기록만 볼 수 있습니다 — Telegram은 한 봇이 다른 봇의 메시지를 읽도록 허용하지 않습니다. 이를 해결하기 위해 서버는 그룹 내 모든 봇이 처리한 메시지(받은 유저 요청과 생성한 응답 양쪽 모두)를 기록하는 <strong>공유 채팅 로그</strong>를 유지합니다.</>
        )}</P>
        <P>{t(
          <>The <IC>/contextlevel</IC> command controls how many of the most recent entries from that shared log are embedded into the bot's system prompt before each turn. This is the mechanism that lets bots "know" what the other bots in the group have recently said and done.</>,
          <><IC>/contextlevel</IC> 명령은 각 턴 전에 그 공유 로그에서 가장 최근 몇 개의 항목이 봇의 시스템 프롬프트에 포함될지를 제어합니다. 이것이 봇들이 그룹 내 다른 봇들이 최근에 말하고 한 일을 "알게" 되는 메커니즘입니다.</>
        )}</P>
        <CommandTable
          headers={[String(t('Command', '명령어')), String(t('Description', '설명'))]}
          rows={[
            ['/contextlevel', String(t('Show current setting', '현재 설정 표시'))],
            ['/contextlevel 20', String(t('Include last 20 log entries in context', '마지막 20개 로그 항목을 컨텍스트에 포함'))],
            ['/contextlevel 0', String(t('Disable shared context entirely', '공유 컨텍스트 완전 비활성화'))],
          ]}
        />
        <P>{t(
          <>Default: <strong className="text-zinc-300">12 entries</strong>. Each bot has its own <IC>/contextlevel</IC> setting, so you can configure them individually using <IC>@botname /contextlevel &lt;n&gt;</IC>.</>,
          <>기본값: <strong className="text-zinc-300">12개 항목</strong>. 각 봇은 자신의 <IC>/contextlevel</IC> 설정을 가지므로, <IC>@botname /contextlevel &lt;n&gt;</IC>으로 봇별로 개별 설정할 수 있습니다.</>
        )}</P>

        <h3 className="text-lg font-semibold text-white mt-6 mb-3">
          {t('Why this matters for token usage', '토큰 사용량에 왜 영향이 있는가')}
        </h3>
        <P>{t(
          <>Every log entry included via <IC>/contextlevel</IC> is embedded into the bot's system prompt on <strong>every turn</strong>. That means:</>,
          <><IC>/contextlevel</IC>로 포함된 모든 로그 항목은 <strong>매 턴마다</strong> 봇의 시스템 프롬프트에 삽입됩니다. 이는 다음을 의미합니다:</>
        )}</P>
        <UL>
          <li>{t(
            <>A higher <IC>/contextlevel</IC> value → the bot sees more of what other bots are doing → better coordination, but every turn sends more tokens to the AI provider.</>,
            <><IC>/contextlevel</IC> 값이 클수록 → 봇이 다른 봇들이 하는 일을 더 많이 볼 수 있고 → 협업이 더 잘 되지만, 매 턴마다 AI 제공자에게 더 많은 토큰을 전송합니다.</>
          )}</li>
          <li>{t(
            <>With multiple bots in the same group all running with a non-zero <IC>/contextlevel</IC>, token usage <strong>multiplies</strong>: each bot independently pulls the shared log into its own prompt, so the same conversation content is billed once per bot per turn.</>,
            <>같은 그룹 안에 여러 봇이 모두 0이 아닌 <IC>/contextlevel</IC>로 돌아가고 있으면 토큰 사용량이 <strong>배수로 증가</strong>합니다: 각 봇이 독립적으로 공유 로그를 자신의 프롬프트에 끌어오므로, 같은 대화 내용이 봇마다 매 턴 한 번씩 청구됩니다.</>
          )}</li>
          <li>{t(
            'Long, active group chats with several cooperating bots can therefore consume tokens significantly faster than a 1:1 chat with a single bot.',
            '따라서 여러 봇이 협업하는 길고 활발한 그룹 채팅은 단일 봇과의 1:1 채팅보다 토큰을 훨씬 빠르게 소모할 수 있습니다.'
          )}</li>
        </UL>
        <P>{t(
          <>Tune <IC>/contextlevel</IC> based on how much cross-bot awareness you actually need. If the bots rarely need to know what each other are doing, a low value (or <IC>0</IC>) is cheaper and often works just as well.</>,
          <>실제로 얼마나 많은 cross-bot 인식이 필요한지에 따라 <IC>/contextlevel</IC>를 조정하세요. 봇들이 서로가 하는 일을 거의 알 필요가 없다면, 낮은 값(또는 <IC>0</IC>)이 더 저렴하고 종종 똑같이 잘 동작합니다.</>
        )}</P>

        <h3 className="text-lg font-semibold text-white mt-6 mb-3">
          {t('When to use /contextlevel 0', '/contextlevel 0을 사용해야 할 때')}
        </h3>
        <P>{t(
          <>Setting <IC>/contextlevel</IC> to <IC>0</IC> disables shared context entirely. The bot will have no visibility into what other bots in the group have said — it behaves as if it were alone in the chat, even though other bots remain present.</>,
          <><IC>/contextlevel</IC>를 <IC>0</IC>으로 설정하면 공유 컨텍스트가 완전히 비활성화됩니다. 봇은 그룹의 다른 봇들이 무엇을 말했는지 전혀 볼 수 없게 되고 — 다른 봇들이 여전히 그룹에 있더라도 자신이 채팅에 혼자 있는 것처럼 동작합니다.</>
        )}</P>
        <InfoBox type="tip">
          {t(
            <><strong>If you want to use only a single bot in a group chat, always run <IC>/contextlevel 0</IC> on that bot.</strong> There is no other bot to coordinate with, so the shared log would only add useless tokens to every prompt. Turning it off removes that overhead completely and keeps each turn as cheap as a plain 1:1 chat.</>,
            <><strong>그룹 채팅에서 봇 하나만 사용하고 싶다면, 그 봇에 대해 반드시 <IC>/contextlevel 0</IC>을 실행하세요.</strong> 조율할 다른 봇이 없으므로 공유 로그는 매 프롬프트에 쓸모없는 토큰만 추가할 뿐입니다. 이를 꺼 두면 해당 오버헤드가 완전히 사라지고, 각 턴이 일반 1:1 채팅만큼 저렴하게 유지됩니다.</>
          )}
        </InfoBox>
        <P>{t(
          <><IC>/contextlevel 0</IC> is also the right choice when you deliberately want multiple bots to work independently in the same group without influencing each other.</>,
          <><IC>/contextlevel 0</IC>은 같은 그룹 내 여러 봇이 서로 영향을 주지 않고 의도적으로 독립적으로 일하기를 원할 때도 맞는 선택입니다.</>
        )}</P>
      </SubSection>

      <SubSection title={String(t('Cowork Customization', '협업 커스터마이징'))}>
        <P>{t('Customize how bots coordinate in group chats by editing:', '그룹 채팅에서 봇의 협업 방식을 다음 파일을 편집하여 커스터마이징하세요:')}</P>
        <CodeBlock code="~/.cokacdir/prompt/cowork.md" />
        <P>{t(
          'This file is auto-generated with defaults on first use. Edit it directly to customize bot coordination, communication style, and task division.',
          '이 파일은 처음 사용 시 기본값으로 자동 생성됩니다. 직접 편집하여 봇 조율, 의사소통 방식, 작업 분배를 커스터마이징하세요.'
        )}</P>
      </SubSection>

      <InfoBox type="info">
        {t('Bots process messages sequentially, not simultaneously.', '봇은 메시지를 동시가 아닌 순차적으로 처리합니다.')}
      </InfoBox>
    </div>
  )
}
