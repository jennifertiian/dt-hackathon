/** Authoritative shared record shapes. See docs/data-model.md for invariants and docs/product.md for behavior.
 * The local backend persists these records in SQLite and returns scoped JSON views. */
export type ID = string;
export type Timestamp = string; // ISO 8601 UTC; creation/submission only, never read time.
export type LocalDate = string; // YYYY-MM-DD in America/Los_Angeles.
export type Color = `#${string}`;
export type MetadataValue = string | number | boolean | MetadataValue[] | { [key: string]: MetadataValue };
export type ValueSchema =
  | { Type: 'Text' | 'Number' | 'Boolean' }
  | { Type: 'Enum'; Options: string[] }
  | { Type: 'List'; ItemSchema: ValueSchema }
  | { Type: 'Record'; Fields: Record<string, ValueSchema> };
export interface PropertyDefinition { Key: string; ValueSchema: ValueSchema }
export interface AvatarConfiguration {
  EyesStyleID: ID;
  MouthStyleID: ID;
  HairStyleID: ID;
  SkinColor: Color;
  HairColor: Color;
  ShirtColor: Color;
  BackgroundColor: Color;
  Blush: boolean;
}
export interface MediaAsset {
  ID: ID;
  OwnerPersonID: ID | null; // null for built-in media.
  Kind: 'Photo' | 'Sticker' | 'Background' | 'SpritePart' | 'Object2D';
  StorageKey: string; // uploaded photo source PNG; pixel thumbnails are derived from this same asset.
  MimeType: string;
  Title: string; // bank defaults copied into each new placement.
  Description: string;
}
export interface SystemAsset {
  ID: ID;
  Kind: 'EyesStyle' | 'MouthStyle' | 'HairStyle' | 'PhotoFrame' | 'Sticker' | 'LockerBackground' | 'Object2D';
  MediaAssetID: ID;
}
export interface SpotifyTrack {
  ID: string; // Spotify's 22-character track ID; player URLs are derived from it.
  Title: string; // full song title, up to 500 characters, separate from the short placement label.
  Artist: string; // up to 500 characters.
}
export interface BoardItem {
  ID: ID; // identifies a placement, not the underlying reusable media.
  Asset: { MediaAssetID: ID };
  SpotifyTrack?: SpotifyTrack; // only on the single music cassette placement; story is Description.
  Title: string;
  Description: string;
  X: number;
  Y: number;
  Width: number;
  Height: number;
  Orientation: number;
  FlipX: boolean;
  FrameStyleID: ID | null; // the three existing Polaroid sizes; no new frame controls.
}
export interface ExteriorSticker {
  SystemAssetID: ID;
  X: number;
  Y: number;
  Width: number;
  Height: number;
}
export interface Locker {
  LockerBoard: { Items: BoardItem[] }; // array order is back to front.
  LockerMeta: {
    InnerBackground: { MediaAssetID: ID };
    OuterBackground: Color;
    OuterStickers: ExteriorSticker[]; // legacy compatibility; the current editor writes an empty array.
  };
}
export interface Person {
  PersonID: ID;
  PersonMeta: Record<string, MetadataValue>;
  AvatarConfiguration: AvatarConfiguration;
  Locker: Locker;
  OnboardingStatus: 'draft' | 'live'; // only live users are eligible for matching.
  IsDemo: boolean; // explicit fictional profile/template; never an imported directory identity.
  EligibleFrom: LocalDate | null; // next matching day, or today for immediate demo publication.
}
/** Directory membership is separate from registration and matching eligibility. Server-only roster. */
export interface DirectoryPerson {
  ID: ID;
  PrimaryEmail: string;
  DisplayName: string;
  PersonID: ID | null; // unregistered directory users have no application profile.
  Suspended: boolean;
}
export interface Invitation {
  ID: ID;
  SenderPersonID: ID;
  RecipientEmail: string;
  CreatedAt: Timestamp;
  // No friendship, mutual, referral score, or matching relationship is created.
}
export type QuestionType = 'MultipleChoice' | 'Checkbox' | 'ShortResponse';
export interface Choice { ID: ID; Label: string }
export type Question = { ID: ID; QuizDay: LocalDate; Prompt: string } & (
  | { Type: 'MultipleChoice' | 'Checkbox'; Choices: Choice[] }
  | { Type: 'ShortResponse'; Choices: [] }
);
export type Answer =
  | { Type: 'SingleChoice'; ChoiceID: ID }
  | { Type: 'MultipleChoices'; ChoiceIDs: ID[] }
  | { Type: 'ShortText'; Content: string };
export type QuestionAnswer = { PersonID: ID; QuestionID: ID } & (
  | { Answer: Answer; AnsweredAt: Timestamp }
  | { Answer: null; AnsweredAt: null }
);
export interface MatchGroup {
  ID: ID;
  Kind?: 'scheduled' | 'demo_preview'; // omitted on older scheduled records.
  OwnerPersonID?: ID; // personal generated cohort; other registered users never join it.
  GenerationSource?: 'pending' | 'luna' | 'fallback';
  Members: ID[]; // nine distinct live people, including marked demo fillers when needed.
  ActiveDay: LocalDate;
  Theme: string;
  QuestionID: ID; // yesterday's scheduled question; demo previews may use today's submitted question.
  MatchingInputs: { PersonID: ID; SourceQuestionID: ID | null }[];
  Reason: string; // grounded matching explanation; Luna may phrase it, with deterministic fallback.
}
export interface Conversation {
  ID: ID;
  Person1: ID;
  Person2: ID;
  FirstMessageTimestamp: Timestamp;
}
export interface MessageBase {
  ID: ID;
  ConversationID: ID;
  Sender: ID;
  Recipient: ID;
  Content: string;
  CreatedAt: Timestamp;
  IsOpened: boolean; // recipient-owned boolean; no read timestamp.
}
export type LockerNote = MessageBase & { Type: 'locker_note' };
export type DirectMessage = MessageBase & { Type: 'direct_message' };
export type Message = LockerNote | DirectMessage;
export interface System {
  People: Person[];
  PropertyDefinitions: PropertyDefinition[];
  Questions: Question[];
  QuestionAnswers: QuestionAnswer[];
  MatchGroups: MatchGroup[];
  Conversations: Conversation[];
  Messages: Message[];
  MediaBucket: { BucketName: string; Assets: MediaAsset[] };
  SystemAssets: SystemAsset[];
  DirectoryPeople: DirectoryPerson[];
  Invitations: Invitation[];
}
/** Authorized view for one signed-in user; excludes the private roster and other users' answers/messages. */
export interface ClientState extends System {
  CurrentPersonID: ID;
  ActiveDay: LocalDate;
  ServerNow: Timestamp; // effective clock on ActiveDay, including day simulation.
  NextRefreshAt: Timestamp; // next America/Los_Angeles midnight; DST-aware.
  DemoMode: boolean;
  IsTemporary: boolean; // complete mock uses an isolated in-memory database, discarded on reload.
  DirectoryPeople: [];
}
