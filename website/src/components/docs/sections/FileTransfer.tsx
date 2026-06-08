import { SectionTitle, SubSection, P, IC, InfoBox, CommandTable, CodeBlock } from '../DocComponents'
import { useLanguage } from '../../LanguageContext'

export default function FileTransfer() {
  const { t } = useLanguage()
  return (
    <div>
      <SectionTitle>{t('File Transfer', '파일 전송')}</SectionTitle>
      <P>{t('Upload and download files between your chat and the bot\'s workspace.', '채팅과 봇의 워크스페이스 간에 파일을 업로드하고 다운로드하세요.')}</P>

      <SubSection title={String(t('Upload', '업로드'))}>
        <P>{t(
          'Send files, photos, or media to the bot. Non-audio uploads are saved to the session\'s working directory; Telegram audio and voice uploads are transcribed as STT input. A workspace is auto-created if none exists.',
          '봇에게 파일, 사진 또는 미디어를 전송하세요. 오디오가 아닌 업로드는 세션의 작업 디렉토리에 저장되고, Telegram 오디오와 음성은 STT 입력으로 변환됩니다. 워크스페이스가 없으면 자동 생성됩니다.'
        )}</P>

        <CommandTable
          headers={[String(t('Type', '유형')), String(t('Saved As', '저장 형식'))]}
          rows={[
            [String(t('Photo', '사진')), 'photo_<id>.jpg'],
            [String(t('Document', '문서')), String(t('Original filename preserved', '원본 파일명 유지'))],
            [String(t('Video', '동영상')), String(t('video_<id>.mp4 or original filename', 'video_<id>.mp4 또는 원본 파일명'))],
            [String(t('Audio', '오디오')), String(t('Telegram: transcribed as STT input', 'Telegram: STT 입력으로 변환'))],
            [String(t('Voice', '음성')), String(t('Telegram: transcribed as STT input', 'Telegram: STT 입력으로 변환'))],
            [String(t('Animation (GIF)', '애니메이션 (GIF)')), String(t('animation_<id>.mp4 or original filename', 'animation_<id>.mp4 또는 원본 파일명'))],
            [String(t('Video Note', '동영상 메모')), 'videonote_<id>.mp4'],
          ]}
        />

        <InfoBox type="info">
          {t(
            <>Maximum file size depends on the chat platform: <strong>Telegram 20MB</strong> (Bot API limit), <strong>Discord 8–100MB</strong> (depends on the server's boost level), <strong>Slack up to 1GB</strong>. Duplicate filenames get a counter appended: <IC>file(1).txt</IC>, <IC>file(2).txt</IC>, etc.</>,
            <>최대 파일 크기는 채팅 플랫폼에 따라 다릅니다: <strong>Telegram 20MB</strong> (Bot API 제한), <strong>Discord 8–100MB</strong> (서버 부스트 레벨에 따라 다름), <strong>Slack 최대 1GB</strong>. 파일명이 중복되면 카운터가 추가됩니다: <IC>file(1).txt</IC>, <IC>file(2).txt</IC> 등.</>
          )}
        </InfoBox>

        <P>{t(
          'If you include a caption with the file, it will be sent to the AI as instructions.',
          '파일에 캡션을 포함하면 AI에게 지시사항으로 전달됩니다.'
        )}</P>
      </SubSection>

      <SubSection title={String(t('Speech Recognition', '음성 인식'))}>
        <P>{t(
          <>Telegram audio and voice uploads are recognized with transcriptor. The bot first replies with <IC>Recognizing speech..</IC> and edits that same message when recognition finishes. If transcriptor needs to download a model first, the same message shows the model download progress.</>,
          <>Telegram 오디오와 음성 업로드는 transcriptor로 인식됩니다. 봇은 먼저 <IC>Recognizing speech..</IC>라고 응답하고, 인식이 끝나면 같은 메시지를 수정합니다. transcriptor가 먼저 모델을 다운로드해야 하면 같은 메시지에 모델 다운로드 진행률이 표시됩니다.</>
        )}</P>
        <P>{t(
          <>Use <IC>/stt_model</IC> to view or set the chat's STT model. Bare model names are passed as <IC>--model-name</IC> and override an inherited <IC>TRANSCRIPTOR_MODEL</IC> value for that run; <IC>path:&lt;model_path&gt;</IC> is passed as <IC>--model</IC>.</>,
          <><IC>/stt_model</IC>로 이 채팅의 STT 모델을 보거나 설정할 수 있습니다. 일반 모델명은 <IC>--model-name</IC>으로 전달되고 해당 실행에서 상속된 <IC>TRANSCRIPTOR_MODEL</IC> 값을 무시하며, <IC>path:&lt;model_path&gt;</IC>는 <IC>--model</IC>로 전달됩니다.</>
        )}</P>
        <CodeBlock code={`/stt_model small
/stt_model large-v3-turbo
/stt_model path:/absolute/model.bin
/stt_model reset`} />
        <InfoBox type="info">
          {t(
            <>
              STT uses the MIT-licensed transcriptor binary and Whisper/whisper.cpp model artifacts. See the{' '}
              <a
                href="https://github.com/kstost/cokacdir/blob/main/THIRD_PARTY_NOTICES.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-light hover:text-white underline underline-offset-2"
              >
                third-party notices
              </a>{' '}
              for copyright, license, model, and audio-consent details.
            </>,
            <>
              STT는 MIT 라이선스의 transcriptor 바이너리와 Whisper/whisper.cpp 모델 아티팩트를 사용합니다. 저작권,
              라이선스, 모델, 오디오 동의 관련 내용은{' '}
              <a
                href="https://github.com/kstost/cokacdir/blob/main/THIRD_PARTY_NOTICES.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-light hover:text-white underline underline-offset-2"
              >
                서드파티 고지
              </a>
              를 확인하세요.
            </>
          )}
        </InfoBox>
      </SubSection>

      <SubSection title={String(t('Multiple Attachments at Once', '여러 첨부를 한 번에 전송'))}>
        <P>{t(
          'You can send multiple files or photos in a single message — Telegram albums, Discord multi-attachment messages, and Slack multi-file uploads are all supported. The bot processes them atomically: non-audio files in the group are saved to the workspace, Telegram audio items are transcribed, and the message caption (typically attached to the first item) is used as the AI instruction for the whole batch.',
          '한 메시지에 여러 파일이나 사진을 함께 전송할 수 있습니다 — Telegram 앨범, Discord 다중 첨부 메시지, Slack 다중 파일 업로드 모두 지원됩니다. 봇은 이들을 한꺼번에 처리합니다: 그룹의 오디오가 아닌 파일은 워크스페이스에 저장되고, Telegram 오디오 항목은 STT로 변환되며, 메시지 캡션(보통 첫 번째 항목에 달림)이 묶음 전체에 대한 AI 지시사항으로 사용됩니다.'
        )}</P>
        <InfoBox type="info">
          {t(
            <>In group chats with prefix mode, only the leading <IC>;</IC> or <IC>@bot</IC> on the album's caption admits the whole batch — the prefix does not need to be repeated on each file.</>,
            <>프리픽스 모드 그룹 채팅에서는 앨범 캡션의 선두 <IC>;</IC> 또는 <IC>@bot</IC>이 묶음 전체를 받아들이게 합니다 — 파일마다 프리픽스를 반복할 필요는 없습니다.</>
          )}
        </InfoBox>
      </SubSection>

      <SubSection title={String(t('Upload While AI Is Busy', 'AI 처리 중 업로드'))}>
        <P>{t(
          'If the AI is busy processing a request and queue mode is ON, file uploads are captured and queued along with the message. When the queued message is processed, the file context is preserved.',
          'AI가 요청을 처리 중이고 큐 모드가 ON이면, 파일 업로드가 메시지와 함께 캡처되어 큐에 추가됩니다. 대기 중인 메시지가 처리될 때 파일 컨텍스트가 보존됩니다.'
        )}</P>
      </SubSection>

      <SubSection title={String(t('Download', '다운로드'))}>
        <P>{t(<>Use <IC>/down &lt;filepath&gt;</IC> to download a file to your chat.</>, <><IC>/down &lt;파일경로&gt;</IC>를 사용하여 파일을 채팅으로 다운로드하세요.</>)}</P>
        <CodeBlock code="/down report.pdf" />

        <ul className="list-disc list-inside space-y-1.5 text-zinc-400 my-4 ml-2">
          <li>{t('Accepts absolute or relative paths', '절대 경로 또는 상대 경로 사용 가능')}</li>
          <li>{t('Relative paths are resolved against the current working directory', '상대 경로는 현재 작업 디렉토리 기준으로 해석됩니다')}</li>
          <li>{t('Only single files — directories are not supported', '단일 파일만 가능 — 디렉토리는 지원하지 않습니다')}</li>
        </ul>
      </SubSection>
    </div>
  )
}
