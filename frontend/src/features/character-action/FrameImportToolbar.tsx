import { InboxOutlined, ScissorOutlined } from '@ant-design/icons'
import { Button, Typography } from 'antd'

const { Text } = Typography

type Props = {
  canMutate: boolean
  importRunning: boolean
  videoPreviewRunning: boolean
  videoRunning: boolean
  onUploadFrames: () => void
  onPreviewVideo: () => void
  onExtractVideo: () => void
}

export default function FrameImportToolbar({
  canMutate,
  importRunning,
  videoPreviewRunning,
  videoRunning,
  onUploadFrames,
  onPreviewVideo,
  onExtractVideo,
}: Props) {
  return (
    <>
      <div className="character-frame-import-actions">
        <Button icon={<InboxOutlined />} disabled={!canMutate} onClick={onUploadFrames} loading={importRunning}>
          Upload Frames / GIF
        </Button>
        <Button icon={<ScissorOutlined />} disabled={!canMutate} onClick={onPreviewVideo} loading={videoPreviewRunning}>
          Preview Video Frame
        </Button>
        <Button icon={<ScissorOutlined />} disabled={!canMutate} onClick={onExtractVideo} loading={videoRunning}>
          Extract Video
        </Button>
      </div>
      <Text className="character-frame-import-limit-note">
        Browser import has no extra size cap. Video preview/extraction is bounded by the server upload limit; very large media should use chunked or local processing later.
      </Text>
    </>
  )
}
