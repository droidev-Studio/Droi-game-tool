import { useState } from 'react'
import type { JobParams } from '../api'
import ParamsStep from '../components/ParamsStep'
import UploadStep from '../components/UploadStep'

const DEFAULT_PARAMS: JobParams = {
  fps: 12,
  max_frames: 300,
  columns: 4,
  padding: 0,
  spacing: 0,
  transparent: true,
  layout_mode: 'fixed_columns',
  crop_mode: 'none',
}

export default function VideoFrameTool() {
  const [file, setFile] = useState<File | null>(null)
  const [params, setParams] = useState<JobParams>(DEFAULT_PARAMS)
  const [ready, setReady] = useState(false)

  if (!ready) {
    return (
      <div className="tool-legacy-frame">
        <UploadStep file={file} onFileChange={setFile} onNext={() => setReady(true)} />
      </div>
    )
  }

  return (
    <div className="tool-legacy-frame">
      <ParamsStep file={file} params={params} onParamsChange={setParams} />
    </div>
  )
}
