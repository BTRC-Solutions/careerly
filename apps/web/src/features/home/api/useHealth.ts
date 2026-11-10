import { HealthResponseSchema } from '@careerly/contracts';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../../shared/api/client';

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet('/health', HealthResponseSchema),
  });
}
