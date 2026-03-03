import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';

export function useTokenPacks() {
  return useQuery({
    queryKey: ['tokenPacks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('token_pack_products')
        .select('*')
        .eq('active', true)
        .order('token_amount', { ascending: true });

      if (error) throw error;
      return data;
    },
  });
}
