import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { server } from './mocks/server'
import { http, HttpResponse } from 'msw'
import Auth from '../views/Auth'

describe('Auth component', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders login form by default', () => {
    render(<Auth />)
    expect(screen.getByText('Welcome back.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
  })

  it('toggles to register mode', async () => {
    const user = userEvent.setup()
    render(<Auth />)

    const registerBtn = screen.getByRole('button', { name: /Register/i })
    await user.click(registerBtn)

    expect(screen.getByText('Create an account.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument()
  })

  it('displays error on login failure', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ error: 'Invalid credentials' }, { status: 401 }),
      ),
    )

    const user = userEvent.setup()
    render(<Auth />)

    await user.type(screen.getByPlaceholderText('Email'), 'test@example.com')
    await user.type(screen.getByPlaceholderText('Password'), 'password')
    await user.click(screen.getByRole('button', { name: /Sign in/i }))

    await waitFor(() => {
      expect(screen.getByText(/Invalid credentials/)).toBeInTheDocument()
    })
  })

  it('displays conflict error on duplicate registration', async () => {
    server.use(
      http.post('/api/auth/register', () =>
        HttpResponse.json({ error: 'Email already in use' }, { status: 409 }),
      ),
    )

    const user = userEvent.setup()
    render(<Auth />)

    await user.click(screen.getByRole('button', { name: /Register/i }))

    await user.type(screen.getByPlaceholderText('Email'), 'existing@example.com')
    await user.type(screen.getByPlaceholderText('Username'), 'newuser')
    await user.type(screen.getByPlaceholderText('Password'), 'password')
    await user.click(screen.getByRole('button', { name: /Create account/i }))

    await waitFor(() => {
      expect(screen.getByText(/Email already in use/)).toBeInTheDocument()
    })
  })

  it('successfully logs in with valid credentials', async () => {
    const user = userEvent.setup()
    render(<Auth />)

    await user.type(screen.getByPlaceholderText('Email'), 'test@example.com')
    await user.type(screen.getByPlaceholderText('Password'), 'password')
    const signInBtn = screen.getByRole('button', { name: /Sign in/i })
    await user.click(signInBtn)

    const pleaseWaitBtn = screen.queryByRole('button', { name: /Please wait/i })
    expect(pleaseWaitBtn).toBeNull()
  })
})
