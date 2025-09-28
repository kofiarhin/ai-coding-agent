import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import App from './App';

describe('App', () => {
  it('renders hero content', () => {
    render(<App />);
    expect(screen.getByText(/AI Terminal Agent/i)).toBeInTheDocument();
  });
});
