export type FriendshipStatus = "pending" | "accepted" | "declined";

export type FriendProfile = {
  id: string;
  displayName: string | null;
  email: string | null;
};

export type FriendshipRow = {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  createdAt: string;
  requester?: FriendProfile;
  addressee?: FriendProfile;
};

export type SocialActivityItem = {
  id: string;
  actorId: string;
  type: string;
  subjectType: string | null;
  subjectId: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  actor?: FriendProfile;
};
