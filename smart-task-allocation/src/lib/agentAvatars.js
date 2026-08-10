export const AGENT_AVATARS = [
  { key: "blue", src: "/optimusblue.png", color: "#2563EB" },
  { key: "black", src: "/optimusblack.png", color: "#1E293B" },
  { key: "red", src: "/optimusred.png", color: "#DC2626" },
  { key: "sage", src: "/optimussage.png", color: "#9DC183" },
];

export function getAgentAvatarSrc(key) {
  return AGENT_AVATARS.find((avatar) => avatar.key === key)?.src ?? AGENT_AVATARS[0].src;
}

// Drives the chat panel's gradient so it matches the agent's chosen hoodie color.
export function getAgentAvatarColor(key) {
  return AGENT_AVATARS.find((avatar) => avatar.key === key)?.color ?? AGENT_AVATARS[0].color;
}
