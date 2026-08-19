import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ClinicalNotePanel } from '@/components/session/ClinicalNotePanel'

import { note } from './fixtures'

describe('ClinicalNotePanel', () => {
  it('renders every clinical section with provenance affordances', () => {
    render(<ClinicalNotePanel note={note} changedSections={[]} onShowSource={() => {}} />)

    expect(screen.getByText('Chief Complaint')).toBeInTheDocument()
    expect(screen.getByText('History of Present Illness')).toBeInTheDocument()
    expect(screen.getByText('Assessment')).toBeInTheDocument()
    expect(screen.getByText('Chest discomfort since yesterday evening.')).toBeInTheDocument()
    expect(screen.getByText('AI Draft')).toBeInTheDocument()
    expect(screen.getByLabelText('Show source for Chief Complaint')).toHaveTextContent('Show Source (1)')
    expect(screen.getByLabelText('Show source for Assessment')).toHaveTextContent('Show Source (0)')
  })

  it('surfaces negated symptoms without presenting them as present', () => {
    render(<ClinicalNotePanel note={note} changedSections={[]} onShowSource={() => {}} />)
    expect(screen.getByText('shortness of breath')).toBeInTheDocument()
    expect(screen.getByText('Denied')).toBeInTheDocument()
  })

  it('opens the evidence viewer for the clicked section', async () => {
    const onShowSource = vi.fn()
    render(<ClinicalNotePanel note={note} changedSections={[]} onShowSource={onShowSource} />)
    await userEvent.click(screen.getByLabelText('Show source for Chief Complaint'))
    expect(onShowSource).toHaveBeenCalledWith('chief_complaint', 'Chest discomfort since yesterday evening.')
  })

  it('lets a human edit and save a section when review editing is enabled', async () => {
    const onSaveSection = vi.fn().mockResolvedValue(undefined)
    render(
      <ClinicalNotePanel
        note={note}
        changedSections={[]}
        editable
        onShowSource={() => {}}
        onSaveSection={onSaveSection}
      />,
    )

    await userEvent.click(screen.getAllByText('Edit')[0])
    const textarea = screen.getByLabelText('Edit Chief Complaint')
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'Chest discomfort since yesterday evening, pressure-like.')
    await userEvent.click(screen.getByText('Save'))

    expect(onSaveSection).toHaveBeenCalledWith(
      'chief_complaint',
      'Chest discomfort since yesterday evening, pressure-like.',
    )
  })

  it('blocks nothing but clearly flags sections that need review', () => {
    const flagged = {
      ...note,
      status: 'REVIEW_REQUIRED' as const,
      review_flags: [
        { section: 'assessment', label: 'Assessment', reason: 'No transcript evidence', severity: 'WARNING' },
      ],
    }
    render(<ClinicalNotePanel note={flagged} changedSections={[]} onShowSource={() => {}} />)
    expect(screen.getByText('1 item(s) require review')).toBeInTheDocument()
    expect(screen.getByText('No transcript evidence')).toBeInTheDocument()
  })
})
