import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownViewerProps {
  content: string
}

function transformMarkdownUrl(url: string): string {
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z\d+/]+=*$/i.test(url)) {
    return url
  }

  return url.startsWith('data:') ? '' : url
}

export default function MarkdownViewer({ content }: MarkdownViewerProps) {
  return (
    <article className="markdown-viewer">
      <Markdown
        remarkPlugins={[remarkGfm]}
        urlTransform={transformMarkdownUrl}
      >
        {content}
      </Markdown>
    </article>
  )
}