import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { UserStats } from '../UserStats'
import * as api from '@/lib/api'

// Mock the API module
jest.mock('@/lib/api', () => ({
  getUserData: jest.fn(),
}))

const mockGetUserData = api.getUserData as jest.MockedFunction<typeof api.getUserData>

describe('UserStats', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders loading state initially', () => {
    mockGetUserData.mockImplementation(() => new Promise(() => {})) // Never resolves
    
    render(<UserStats email="test@example.com" />)
    expect(screen.getByText('Жүктелуде...')).toBeInTheDocument()
  })

  it('renders user data when loaded', async () => {
    const mockUserData = {
      id: 1,
      email: 'test@example.com',
      nickname: 'TestUser',
      league: 'Алмас',
      league_position: 5,
      league_size: 30,
      total_solved: 50,
      week_solved: 10,
      week_points: 100,
      total_points: 500,
    }

    mockGetUserData.mockResolvedValue({ data: mockUserData, error: null })

    render(<UserStats email="test@example.com" />)

    await waitFor(() => {
      expect(screen.getByText('TestUser')).toBeInTheDocument()
      expect(screen.getByText('Алмас')).toBeInTheDocument()
      expect(screen.getByText('100 ұпай')).toBeInTheDocument()
      expect(screen.getByText('50 шешілген')).toBeInTheDocument()
    })
  })

  it('renders email when nickname is not available', async () => {
    const mockUserData = {
      id: 1,
      email: 'test@example.com',
      nickname: null,
      league: 'Қола',
      total_solved: 0,
      week_solved: 0,
      week_points: 0,
      total_points: 0,
    }

    mockGetUserData.mockResolvedValue({ data: mockUserData, error: null })

    render(<UserStats email="test@example.com" />)

    await waitFor(() => {
      expect(screen.getByText('test@example.com')).toBeInTheDocument()
    })
  })

  it('handles API error gracefully', async () => {
    mockGetUserData.mockResolvedValue({ data: null, error: 'API Error' })

    render(<UserStats email="test@example.com" />)

    await waitFor(() => {
      // Should show email as fallback
      expect(screen.getByText('test@example.com')).toBeInTheDocument()
    })
  })

  it('renders league position when available', async () => {
    const mockUserData = {
      id: 1,
      email: 'test@example.com',
      nickname: 'TestUser',
      league: 'Алмас',
      league_position: 3,
      league_size: 30,
      total_solved: 50,
      week_solved: 10,
      week_points: 100,
      total_points: 500,
    }

    mockGetUserData.mockResolvedValue({ data: mockUserData, error: null })

    render(<UserStats email="test@example.com" />)

    await waitFor(() => {
      expect(screen.getByText(/3\/30 лигада/)).toBeInTheDocument()
    })
  })

  it('does not render league position when not available', async () => {
    const mockUserData = {
      id: 1,
      email: 'test@example.com',
      nickname: 'TestUser',
      league: 'Қола',
      league_position: null,
      league_size: null,
      total_solved: 0,
      week_solved: 0,
      week_points: 0,
      total_points: 0,
    }

    mockGetUserData.mockResolvedValue({ data: mockUserData, error: null })

    render(<UserStats email="test@example.com" />)

    await waitFor(() => {
      expect(screen.queryByText(/лигада/)).not.toBeInTheDocument()
    })
  })

  it('handles empty email', async () => {
    render(<UserStats email="" />)

    await waitFor(() => {
      // Should not show loading after empty email
      expect(screen.queryByText('Жүктелуде...')).not.toBeInTheDocument()
    })
  })
})
