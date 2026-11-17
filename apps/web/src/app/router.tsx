import { createHashRouter, Navigate } from 'react-router';
import { AiUsagePage } from '../features/ai/pages/AiUsagePage';
import { HomePage } from '../features/home/pages/HomePage';
import {
  JobPostingPage,
  NewJobPostingPage,
} from '../features/job-postings/pages/JobPostingEditorPage';
import { JobPostingsPage } from '../features/job-postings/pages/JobPostingsPage';
import { WelcomePage } from '../features/onboarding/pages/WelcomePage';
import { ProfileLayout } from '../features/profile/components/ProfileLayout';
import { ContainerDetailPage } from '../features/profile/pages/ContainerDetailPage';
import { ContainerListPage } from '../features/profile/pages/ContainerListPage';
import { EducationPage } from '../features/profile/pages/EducationPage';
import { LanguagesPage } from '../features/profile/pages/LanguagesPage';
import { CvImportPage } from '../features/profile/pages/CvImportPage';
import { PersonalInfoPage } from '../features/profile/pages/PersonalInfoPage';
import { SettingsPage } from '../features/settings/pages/SettingsPage';
import { MatchSummaryPage } from '../features/tailoring/pages/MatchSummaryPage';
import { TemplatesPage } from '../features/templates/pages/TemplatesPage';
import { AppLayout } from './layout/AppLayout';

// Hash routing works the same in Vite dev, in the browser and from the packaged `app://` protocol.
export const router = createHashRouter([
  // First-run wizard: full screen, outside the app layout.
  { path: 'welcome', element: <WelcomePage /> },
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      // Outside the profile tabs: a focused flow of its own.
      { path: 'profile/import', element: <CvImportPage /> },
      {
        path: 'profile',
        element: <ProfileLayout />,
        children: [
          { index: true, element: <Navigate to="personal" replace /> },
          { path: 'personal', element: <PersonalInfoPage /> },
          { path: 'experience', element: <ContainerListPage kind="position" /> },
          { path: 'experience/:id', element: <ContainerDetailPage kind="position" /> },
          { path: 'projects', element: <ContainerListPage kind="project" /> },
          { path: 'projects/:id', element: <ContainerDetailPage kind="project" /> },
          { path: 'education', element: <EducationPage /> },
          { path: 'languages', element: <LanguagesPage /> },
        ],
      },
      { path: 'job-postings', element: <JobPostingsPage /> },
      { path: 'job-postings/new', element: <NewJobPostingPage /> },
      { path: 'job-postings/:id', element: <JobPostingPage /> },
      { path: 'tailoring/:id', element: <MatchSummaryPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/ai-usage', element: <AiUsagePage /> },
      { path: 'settings/templates', element: <TemplatesPage /> },
    ],
  },
]);
