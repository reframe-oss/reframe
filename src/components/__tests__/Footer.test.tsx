import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import Footer from '../Footer'

describe('Footer community links', () => {
  it('links to Reframe social accounts and labels the X icon', () => {
    render(<Footer />)

    const xLink = screen.getByRole('link', { name: 'X (Twitter)' })
    expect(xLink).toHaveAttribute('href', 'https://x.com/magic_peach_dev')
    expect(xLink).toHaveAttribute('target', '_blank')
    expect(xLink).toHaveAttribute('rel', 'noopener noreferrer')
    expect(xLink.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')

    const instagramLink = screen.getByRole('link', { name: 'Instagram' })
    expect(instagramLink).toHaveAttribute(
      'href',
      'https://www.instagram.com/magic_peach_dev',
    )
    expect(instagramLink).toHaveAttribute('target', '_blank')
    expect(instagramLink).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
