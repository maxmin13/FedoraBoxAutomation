// Docs page — renders markdown files from the docs/ folder.
// The user picks a document from the sidebar; the content is
// read from disk via IPC and rendered with react-markdown.

import { useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// All available docs. Add new entries here when a new doc is created.
const DOC_FILES: { label: string; filename: string }[] = [
  { label: 'Post-Install Setup', filename: 'POST-INSTALL.md' },
  { label: 'Development Guide', filename: 'DEVELOPMENT.md' },
  { label: 'Testing Guide', filename: 'TESTING.md' },
  { label: 'GUI Design', filename: 'ELECTRON-GUI-DESIGN.md' },
]

export default function DocsPage() {
  // The filename of the currently selected doc
  const [selectedFile, setSelectedFile] = useState(DOC_FILES[0].filename)

  // The markdown content returned from disk
  const [content, setContent] = useState('')

  // Error message if the file could not be read
  const [error, setError] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)

  // Load the selected doc whenever the selection changes
  useEffect(() => {
    loadDoc(selectedFile)
  }, [selectedFile])

  /**
   * Reads the markdown file from disk via the main process and updates state.
   * @param {string} filename - Base filename inside the docs/ folder
   */
  async function loadDoc(filename: string) {
    setLoading(true)
    setError(null)
    setContent('')

    const result = await window.electronAPI.readDoc(filename)

    if (result.ok) {
      setContent(result.content)
    } else {
      setError(result.error ?? 'Could not load document')
    }

    setLoading(false)
  }

  return (
    <div className="flex h-full gap-0">

      {/* Sidebar — document list */}
      <aside className="w-48 shrink-0 overflow-y-auto border-r border-zinc-700 pr-3 mr-5">
        <p className="text-zinc-500 text-xs uppercase tracking-wider mb-3">Documents</p>
        <nav className="space-y-1">
          {DOC_FILES.map((doc) => {
            const isActive = doc.filename === selectedFile
            return (
              <button
                key={doc.filename}
                onClick={() => setSelectedFile(doc.filename)}
                className={[
                  'w-full text-left px-3 py-2 rounded text-sm transition-colors',
                  isActive
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800',
                ].join(' ')}
              >
                {doc.label}
              </button>
            )
          })}
        </nav>
      </aside>

      {/* Main content — rendered markdown */}
      <main className="flex-1 min-w-0 overflow-y-auto pl-1">
        {loading && (
          <p className="text-zinc-500 text-sm">Loading...</p>
        )}

        {error && (
          <div className="bg-red-900 border border-red-700 rounded p-4 text-red-300 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && content && (
          <div className="prose prose-invert prose-sm max-w-3xl">
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={{
                a({ href, children }) {
                  const docFile = DOC_FILES.find((d) => d.filename === href)
                  if (docFile) {
                    return (
                      <button
                        onClick={() => setSelectedFile(docFile.filename)}
                        className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
                      >
                        {children}
                      </button>
                    )
                  }
                  return <span className="text-blue-400 underline">{children}</span>
                },
              }}
            >
              {content}
            </Markdown>
          </div>
        )}
      </main>
    </div>
  )
}
