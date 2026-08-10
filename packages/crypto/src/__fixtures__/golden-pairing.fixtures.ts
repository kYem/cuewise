// Frozen wire-framing guarantee: two devices on different app versions must derive the same
// commitment and SAS from the same key material. Computed once from the CURRENT correct
// implementation of makePairingCommitment/derivePairingSas; never regenerate.
export const GOLDEN_PAIRING = {
  pubB64url: 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA',
  nonceB64url: 'yMfGxcTDwsHAv769vLu6ubi3trW0s7KxsK-urayrqqk',
  commitment: 'HdqKWAIvPuCyVegOVvM1YJ63kDN0q3cjX3x4BkpZhd8',
  requesterPubB64url: 'AQQHCg0QExYZHB8iJSgrLjE0Nzo9QENGSUxPUlVYW14',
  approverPubB64url: '__37-ff18_Hv7evp5-Xj4d_d29nX1dPRz83LycfFw8E',
  pairingId: 'golden-pairing-id-1',
  sas: '243016',
} as const;
