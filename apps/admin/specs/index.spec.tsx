import React from 'react';
import { render } from '@testing-library/react';
import Page from '../src/app/page';
import { useRequireAuth } from '../src/hooks/useRequireAuth';

jest.mock('../src/hooks/useRequireAuth');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

const { useRouter } = require('next/navigation');

describe('Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      refresh: jest.fn(),
    });
    (useRequireAuth as jest.Mock).mockReturnValue({
      loading: false,
      user: { id: 'user-1', email: 'admin@example.com' },
      adminUser: { email: 'admin@example.com', role: 'superadmin' },
    });
  });

  it('should render successfully', () => {
    const { baseElement } = render(<Page />);
    expect(baseElement).toBeTruthy();
  });
});
