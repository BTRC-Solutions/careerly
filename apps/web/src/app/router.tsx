import { createHashRouter } from 'react-router';
import { HomePage } from '../features/home/pages/HomePage';
import { AppLayout } from './layout/AppLayout';

// Hash routing works the same in Vite dev, in the browser and from the packaged `app://` protocol.
export const router = createHashRouter([
  {
    element: <AppLayout />,
    children: [{ index: true, element: <HomePage /> }],
  },
]);
