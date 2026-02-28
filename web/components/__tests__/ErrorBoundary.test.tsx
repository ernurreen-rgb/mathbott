import React from 'react'
import { render, screen } from '@testing-library/react'
import * as Sentry from "@sentry/nextjs";
import { ErrorBoundary } from '../ErrorBoundary'

jest.mock("@sentry/nextjs", () => ({
  captureException: jest.fn(),
}));

// Mock console.error to avoid noise in test output
const originalError = console.error
beforeAll(() => {
  console.error = jest.fn()
})

afterAll(() => {
  console.error = originalError
})

const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error')
  }
  return <div>No error</div>
}

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    )
    expect(screen.getByText('No error')).toBeInTheDocument()
  })

  it('renders error UI when there is an error', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    // Component shows Kazakh text "Қате орын алды"
    expect(screen.getByText(/Қате орын алды/i)).toBeInTheDocument()
    expect(screen.getByText(/Test error/i)).toBeInTheDocument()
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
  })
})
