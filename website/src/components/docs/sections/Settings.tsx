import { Link } from 'react-router-dom'
import { SectionTitle, SubSection, P, IC, InfoBox, CommandTable } from '../DocComponents'
import { useLanguage } from '../../LanguageContext'

export default function Settings() {
  const { t } = useLanguage()
  return (
    <div>
      <SectionTitle>{t('Settings', '설정')}</SectionTitle>
      <P>{t('Configure various settings for your chat environment.', '채팅 환경의 다양한 설정을 구성하세요.')}</P>

      <SubSection title={String(t('Command Reference', '명령어 참조'))}>
        <CommandTable
          headers={[String(t('Command', '명령어')), String(t('Description', '설명'))]}
          rows={[
            ['/silent', String(t('Toggle silent mode (hide/show tool call details)', '무음 모드 전환 (도구 호출 세부사항 숨기기/표시)'))],
            ['/debug', String(t('Enable/disable debug logging', '디버그 로깅 활성화/비활성화'))],
            ['/greeting', String(t('Toggle startup greeting style (Compact / Full)', '시작 인사 스타일 전환 (간략 / 전체)'))],
            ['/setpollingtime <ms>', String(t('Set API polling interval', 'API 폴링 간격 설정'))],
            ['/envvars', String(t('Show all environment variables (owner only)', '모든 환경변수 표시 (소유자 전용)'))],
            ['/help', String(t('Display full command reference', '전체 명령어 참조 표시'))],
          ]}
        />
      </SubSection>

      <SubSection title="/silent">
        <P>{t(<>Toggles silent mode. Default: <strong className="text-zinc-300">ON</strong>.</>, <>무음 모드를 전환합니다. 기본값: <strong className="text-zinc-300">ON</strong>.</>)}</P>
        <ul className="list-disc list-inside space-y-1.5 text-zinc-400 my-4 ml-2">
          <li>{t(<><strong className="text-zinc-300">ON:</strong> Hides tool call details for cleaner output</>, <><strong className="text-zinc-300">ON:</strong> 깔끔한 출력을 위해 도구 호출 세부사항을 숨깁니다</>)}</li>
          <li>{t(<><strong className="text-zinc-300">OFF:</strong> Shows full details of every tool call</>, <><strong className="text-zinc-300">OFF:</strong> 모든 도구 호출의 전체 세부사항을 표시합니다</>)}</li>
        </ul>
      </SubSection>

      <SubSection title="/debug">
        <P>{t(<>Enables or disables debug logging. Default: <strong className="text-zinc-300">OFF</strong>.</>, <>디버그 로깅을 활성화/비활성화합니다. 기본값: <strong className="text-zinc-300">OFF</strong>.</>)}</P>
        <P>{t('When enabled, logs details for:', '활성화 시 다음 항목의 세부 로그를 기록합니다:')}</P>
        <ul className="list-disc list-inside space-y-1.5 text-zinc-400 my-4 ml-2">
          <li>{t('Telegram API operations', '텔레그램 API 작업')}</li>
          <li>{t('AI service calls', 'AI 서비스 호출')}</li>
          <li>{t('Cron scheduler', '크론 스케줄러')}</li>
        </ul>
        <InfoBox type="info">
          {t('This is a global toggle — it affects all chats.', '이것은 전역 토글입니다 — 모든 채팅에 영향을 미칩니다.')}
        </InfoBox>
      </SubSection>

      <SubSection title="/greeting">
        <P>{t(
          <>Toggles the startup greeting style between <strong className="text-zinc-300">Compact</strong> and <strong className="text-zinc-300">Full</strong> formats.</>,
          <>시작 인사 스타일을 <strong className="text-zinc-300">간략</strong>과 <strong className="text-zinc-300">전체</strong> 형식 사이에서 전환합니다.</>
        )}</P>
      </SubSection>

      <SubSection title="/setpollingtime">
        <P>{t(
          'Sets the API polling interval in milliseconds. This controls how frequently streaming responses and shell command output are updated.',
          'API 폴링 간격을 밀리초 단위로 설정합니다. 스트리밍 응답과 셸 명령어 출력이 업데이트되는 빈도를 제어합니다.'
        )}</P>
        <ul className="list-disc list-inside space-y-1.5 text-zinc-400 my-4 ml-2">
          <li>{t(<>Minimum: <strong className="text-zinc-300">2500ms</strong></>, <>최소: <strong className="text-zinc-300">2500ms</strong></>)}</li>
          <li>{t(<>Recommended: <strong className="text-zinc-300">3000ms or higher</strong></>, <>권장: <strong className="text-zinc-300">3000ms 이상</strong></>)}</li>
        </ul>
      </SubSection>

      <SubSection title="/envvars">
        <P>{t(
          <>Prints every environment variable currently visible to the bot process, sorted alphabetically. <strong>Bot owner only.</strong></>,
          <>봇 프로세스에 현재 보이는 모든 환경변수를 알파벳순으로 출력합니다. <strong>봇 소유자 전용입니다.</strong></>
        )}</P>
        <P>{t(
          <>Useful for verifying that <IC>~/.cokacdir/.env.json</IC> loaded correctly, or checking whether a <IC>COKAC_*</IC> override is active.</>,
          <><IC>~/.cokacdir/.env.json</IC>이 올바르게 로드되었는지, 또는 <IC>COKAC_*</IC> 재지정이 활성 상태인지 확인할 때 유용합니다.</>
        )}</P>
        <InfoBox type="warning">
          {t(
            <><strong>⚠ Security warning:</strong> <IC>/envvars</IC> exposes <strong>all</strong> environment variables with no redaction — including API keys, tokens, and credentials. Telegram stores message history on its servers, so anything printed by this command is persisted until you delete the messages. Use it only for diagnostics, clear the response afterward, and <strong>always use it in a 1:1 chat</strong> — never in a group chat. When the owner runs <IC>/envvars</IC> in a group, the response is a normal group message that every member sees, regardless of the <IC>/public</IC> setting.</>,
            <><strong>⚠ 보안 경고:</strong> <IC>/envvars</IC>는 API 키, 토큰, 자격 증명을 포함한 <strong>모든</strong> 환경변수를 마스킹 없이 노출합니다. Telegram은 메시지 기록을 서버에 저장하므로, 이 명령으로 출력된 내용은 메시지를 삭제할 때까지 남아 있습니다. 진단 용도로만 사용하고, 사용 후에는 응답을 삭제하며, <strong>항상 1:1 채팅에서만 사용하세요</strong> — 절대 그룹 채팅에서는 사용하지 마세요. 소유자가 그룹에서 <IC>/envvars</IC>를 실행하면, 응답은 <IC>/public</IC> 설정과 무관하게 그룹의 모든 멤버가 보는 일반 그룹 메시지가 됩니다.</>
          )}
        </InfoBox>
        <P>{t(
          <>See <Link to="/docs/env-vars" className="text-accent-cyan hover:underline">Environment Variables</Link> for the full list of variables cokacdir reads and for the <IC>~/.cokacdir/.env.json</IC> auto-loader.</>,
          <>cokacdir가 읽는 변수 전체 목록과 <IC>~/.cokacdir/.env.json</IC> 자동 로더에 대해서는 <Link to="/docs/env-vars" className="text-accent-cyan hover:underline">환경변수</Link> 페이지를 참조하세요.</>
        )}</P>
      </SubSection>

      <SubSection title="/help">
        <P>{t(
          'Displays the full command reference with all available commands and their descriptions.',
          '사용 가능한 모든 명령어와 설명이 포함된 전체 명령어 참조를 표시합니다.'
        )}</P>
      </SubSection>
    </div>
  )
}
