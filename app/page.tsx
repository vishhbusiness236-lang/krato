import HomePageClient from '@/components/HomePageClient';
import LandingGate from '@/app/components/LandingGate';
import { createClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <LandingGate />;
  }

  return <HomePageClient />;
}
