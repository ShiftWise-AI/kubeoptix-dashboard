import { useEffect, useId, useState } from 'react'
import Markdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

type ColorScheme = 'light' | 'dark'

interface MarkdownViewerProps {
  content: string
  colorScheme: ColorScheme
}

interface MermaidDiagramProps {
  chart: string
  colorScheme: ColorScheme
}

function MermaidDiagram({ chart, colorScheme }: MermaidDiagramProps) {
  const diagramId = `mermaid-${useId().replace(/:/g, '')}`
  const [svg, setSvg] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true

    void import('mermaid')
      .then(({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: colorScheme === 'dark' ? 'dark' : 'default',
        })

        return mermaid.render(diagramId, chart)
      })
      .then((result) => {
        if (isActive) {
          setSvg(result.svg)
          setError(null)
        }
      })
      .catch((renderError: unknown) => {
        if (isActive) {
          setSvg('')
          setError(renderError instanceof Error ? renderError.message : 'Invalid Mermaid diagram.')
        }
      })

    return () => {
      isActive = false
    }
  }, [chart, colorScheme, diagramId])

  if (error) {
    return <div className="markdown-mermaid-error">Could not render Mermaid diagram: {error}</div>
  }

  if (!svg) {
    return <div className="markdown-mermaid-loading">Rendering diagram...</div>
  }

  return (
    <div
      className="markdown-mermaid-diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

export default function MarkdownViewer({ content, colorScheme }: MarkdownViewerProps) {
  const components: Components = {
    code({ className, children, node: _node, ...props }) {
      const language = /language-([^\s]+)/.exec(className ?? '')?.[1]

      if (language === 'mermaid') {
        return <MermaidDiagram chart={String(children).replace(/\n$/, '')} colorScheme={colorScheme} />
      }

      return <code className={className} {...props}>{children}</code>
    },
  }

  return (
    <article className="markdown-viewer">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </Markdown>
    </article>
  )
}