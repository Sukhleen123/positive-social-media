export interface PredefinedTopic {
  id: string;
  label: string;
  description: string;
  keywords: string[];
}

export const PREDEFINED_TOPICS: PredefinedTopic[] = [
  {
    id: 'ai-tech',
    label: 'AI / Technology',
    description: 'Artificial intelligence hype, tech layoffs, surveillance, data privacy violations, algorithm bias',
    keywords: ['ai', 'artificial intelligence', 'layoffs', 'surveillance', 'algorithm', 'bias', 'privacy', 'data breach', 'automation', 'chatgpt'],
  },
  {
    id: 'war-conflict',
    label: 'War & Conflict',
    description: 'Military conflict, warfare, bombings, soldiers killed, invasion, occupation, casualties',
    keywords: ['war', 'conflict', 'military', 'bombing', 'soldiers', 'invasion', 'casualties', 'missile', 'troops', 'battlefield'],
  },
  {
    id: 'politics',
    label: 'Politics',
    description: 'Political drama, partisan fights, elections controversy, government corruption, political scandals',
    keywords: ['politics', 'politician', 'election', 'congress', 'senate', 'democrat', 'republican', 'corruption', 'scandal', 'legislation'],
  },
  {
    id: 'violence-crime',
    label: 'Violence & Crime',
    description: 'Violent crime, murder, assault, robbery, shooting, homicide, criminal activity',
    keywords: ['murder', 'shooting', 'violence', 'crime', 'assault', 'robbery', 'homicide', 'stabbing', 'criminal', 'arrest'],
  },
  {
    id: 'animal-cruelty',
    label: 'Animal Cruelty',
    description: 'Animal abuse, cruelty to animals, animal neglect, trophy hunting, factory farming suffering',
    keywords: ['animal abuse', 'cruelty', 'neglect', 'trophy hunting', 'factory farming', 'poaching', 'animal suffering', 'mistreatment'],
  },
  {
    id: 'natural-disasters',
    label: 'Natural Disasters',
    description: 'Earthquakes, hurricanes, floods, wildfires, tornadoes, tsunami, disaster deaths',
    keywords: ['earthquake', 'hurricane', 'flood', 'wildfire', 'tornado', 'tsunami', 'disaster', 'evacuation', 'casualties', 'destruction'],
  },
  {
    id: 'disease-pandemic',
    label: 'Disease & Pandemic',
    description: 'Disease outbreaks, pandemic, virus spread, epidemic, health crisis, infection deaths',
    keywords: ['pandemic', 'disease', 'outbreak', 'virus', 'epidemic', 'infection', 'contagion', 'pathogen', 'quarantine', 'deaths'],
  },
  {
    id: 'climate-doom',
    label: 'Climate Doom',
    description: 'Climate catastrophe, extinction, environmental collapse, rising seas, heat records, doom predictions',
    keywords: ['climate', 'extinction', 'collapse', 'catastrophe', 'emissions', 'warming', 'sea level', 'drought', 'heatwave', 'apocalypse'],
  },
  {
    id: 'crypto-nft',
    label: 'Crypto & NFTs',
    description: 'Cryptocurrency crashes, NFT scams, blockchain fraud, rug pulls, crypto market drama',
    keywords: ['crypto', 'bitcoin', 'nft', 'blockchain', 'token', 'rug pull', 'scam', 'defi', 'ethereum', 'crash'],
  },
  {
    id: 'celebrity-drama',
    label: 'Celebrity Drama',
    description: 'Celebrity feuds, scandals, breakups, tabloid drama, influencer controversies',
    keywords: ['celebrity', 'scandal', 'feud', 'breakup', 'drama', 'influencer', 'tabloid', 'beef', 'controversy', 'gossip'],
  },
];
