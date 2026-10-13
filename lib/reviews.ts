export type JobStatus =
  | "assigned"
  | "accepted"
  | "on_the_way"
  | "arrived"
  | "in_progress"
  | "awaiting_confirmation"
  | "completed"
  | "cancelled"
  | "disputed";

export type JobReview = {
  job_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
};
