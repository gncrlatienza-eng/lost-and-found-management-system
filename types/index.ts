export type UserRole = 'student' | 'admin';
export type LostItemStatus = 'searching' | 'possible_match' | 'ready_for_claiming' | 'resolved' | 'expired';
export type FoundReportStatus =
  | 'pending_review' | 'approved' | 'waiting_submission'
  | 'submitted_to_sdfo' | 'matched_to_owner' | 'resolved' | 'rejected';
export type MatchStatus = 'pending' | 'confirmed' | 'resolved';
export type ClaimStatus = 'pending' | 'proof_submitted' | 'claimed' | 'expired';
export type Possession = 'with_student' | 'submitted_to_sdfo';

export interface User {
  id: string;
  student_id: string;
  name: string;
  email: string;
  contact: string;
  role: UserRole;
  created_at: string;
}

export interface LostItem {
  id: string;
  user_id: string;
  name: string;
  description: string;
  category: string;
  location: string;
  date_time: string;
  photos: string[];
  status: LostItemStatus;
  created_at: string;
  user?: User;
}

export interface FoundReport {
  id: string;
  user_id: string;
  lost_item_id?: string;
  item_description: string;
  location: string;
  date_time: string;
  photos: string[];
  possession: Possession;
  status: FoundReportStatus;
  rejection_reason?: string;
  created_at: string;
  user?: User;
}

export interface Match {
  id: string;
  lost_item_id: string;
  found_report_id: string;
  status: MatchStatus;
  matched_by: string;
  created_at: string;
}

export interface Claim {
  id: string;
  match_id: string;
  claimant_id: string;
  proof_photos: string[];
  proof_description?: string;
  schedule?: string;
  status: ClaimStatus;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
}
