import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CheckCard from '../components/CheckCard'
import type { CheckResult } from '../electron.d'

const passCheck: CheckResult = {
  id: 'os',
  label: 'Operating System',
  status: 'pass',
  detail: 'Windows 11 Home (64-bit)',
}

const warnCheck: CheckResult = {
  id: 'secboot',
  label: 'Secure Boot',
  status: 'warn',
  detail: 'Enabled. OK for VirtualBox 7+.',
}

const failCheck: CheckResult = {
  id: 'vboxinst',
  label: 'VirtualBox',
  status: 'fail',
  detail: 'Not installed.',
}

describe('CheckCard', () => {

  describe('status badges', () => {
    it('shows OK badge for a passing check', () => {
      render(<CheckCard check={passCheck} />)
      expect(screen.getByText('OK')).toBeInTheDocument()
    })

    it('shows !! badge for a warning check', () => {
      render(<CheckCard check={warnCheck} />)
      expect(screen.getByText('!!')).toBeInTheDocument()
    })

    it('shows XX badge for a failing check', () => {
      render(<CheckCard check={failCheck} />)
      expect(screen.getByText('XX')).toBeInTheDocument()
    })
  })

  describe('content', () => {
    it('renders the check label', () => {
      render(<CheckCard check={passCheck} />)
      expect(screen.getByText('Operating System')).toBeInTheDocument()
    })

    it('renders the check detail', () => {
      render(<CheckCard check={passCheck} />)
      expect(screen.getByText('Windows 11 Home (64-bit)')).toBeInTheDocument()
    })
  })

  describe('"How to fix" toggle', () => {
    it('hides the fix button for a passing check even when an action is provided', () => {
      render(<CheckCard check={passCheck} action={<span>Fix action</span>} />)
      expect(screen.queryByText('How to fix')).not.toBeInTheDocument()
    })

    it('shows the fix button when a failing check has an action', () => {
      render(<CheckCard check={failCheck} action={<span>Fix action</span>} />)
      expect(screen.getByText('How to fix')).toBeInTheDocument()
    })

    it('shows the fix button when a warning check has an action', () => {
      render(<CheckCard check={warnCheck} action={<span>Fix action</span>} />)
      expect(screen.getByText('How to fix')).toBeInTheDocument()
    })

    it('hides the action panel before the toggle is clicked', () => {
      render(<CheckCard check={failCheck} action={<span>Fix action content</span>} />)
      expect(screen.queryByText('Fix action content')).not.toBeInTheDocument()
    })

    it('reveals the action panel after clicking "How to fix"', () => {
      render(<CheckCard check={failCheck} action={<span>Fix action content</span>} />)
      fireEvent.click(screen.getByText('How to fix'))
      expect(screen.getByText('Fix action content')).toBeInTheDocument()
    })

    it('changes the button label to "Hide fix" when the panel is open', () => {
      render(<CheckCard check={failCheck} action={<span>Fix action</span>} />)
      fireEvent.click(screen.getByText('How to fix'))
      expect(screen.getByText('Hide fix')).toBeInTheDocument()
    })

    it('hides the action panel again after clicking "Hide fix"', () => {
      render(<CheckCard check={failCheck} action={<span>Fix action content</span>} />)
      fireEvent.click(screen.getByText('How to fix'))
      fireEvent.click(screen.getByText('Hide fix'))
      expect(screen.queryByText('Fix action content')).not.toBeInTheDocument()
    })

    it('shows nothing when no action is provided for a failing check', () => {
      render(<CheckCard check={failCheck} />)
      expect(screen.queryByText('How to fix')).not.toBeInTheDocument()
    })
  })
})
