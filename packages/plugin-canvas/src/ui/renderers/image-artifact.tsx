import type { ArtifactRendererProps } from './types.js'

/**
 * ImageArtifact — renders the image variant of the artifact (data URL
 * or https URL). Both URL forms were sanitised at the schema layer:
 *
 *   - `source === 'data'` → `dataUrl` must start with
 *     `data:image/(png|jpeg|webp|gif|svg+xml);base64,`
 *   - `source === 'url'` → `url` must start with `https://`
 *
 * `alt` is a required field on the schema so this renderer never
 * produces an unlabelled image. `loading="lazy"` + `decoding="async"`
 * keep large images from blocking the panel render.
 *
 * SVG via data URL goes through the browser's normal image pipeline
 * (no script execution); apps that need inline SVG with interactivity
 * should publish a `kind: 'svg'` artifact instead.
 */
export function ImageArtifact({ artifact }: ArtifactRendererProps<'image'>) {
  const src = artifact.source === 'data' ? artifact.dataUrl : artifact.url
  return (
    <div data-testid="image-artifact" className="grid place-items-center p-3">
      <img
        src={src}
        alt={artifact.alt}
        loading="lazy"
        decoding="async"
        data-source={artifact.source}
        width={artifact.width}
        height={artifact.height}
        className="max-h-[480px] max-w-full rounded-md border object-contain"
      />
    </div>
  )
}
