export interface ViralScoreResult {
  score: number;
  maxScore: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  estimatedReach: string;
  formatFit: number;
  hookStrength: number;
  readabilityScore: number;
}

export interface ViralScoreRequest {
  text: string;
  format?: string;
  handle?: string;
}
