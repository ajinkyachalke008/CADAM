import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';

export function useTokenCosts() {
  return useQuery({
    queryKey: ['tokenCosts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('token_costs')
        .select('*')
        .order('cost', { ascending: true });

      if (error) throw error;
      return data;
    },
  });
}
