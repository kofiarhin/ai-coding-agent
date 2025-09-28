import { useQuery } from '@tanstack/react-query';
import content from '../data/content.json';

const fetchContent = async () => content;

const useContent = () => {
  return useQuery({
    queryKey: ['content'],
    queryFn: fetchContent,
    staleTime: Infinity
  });
};

export default useContent;
