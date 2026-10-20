// Shape returned by the get_active_featured_providers RPC.
// profile_image_url is optional because older cached rows (SecureStore) won't have it.
export type FeaturedProvider = {
  provider_id: string;
  business_name: string;
  bio: string | null;
  profile_image_url?: string | null;
  rating_average: number | null;
  total_reviews: number | null;
  category: string;
  category_id?: string;
  area_name: string;
  featured_until?: string;
};