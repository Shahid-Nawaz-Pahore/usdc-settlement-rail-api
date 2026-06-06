import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the operator dashboard header', () => {
  render(<App />);
  expect(screen.getByText('Settlement Rail')).toBeInTheDocument();
});
