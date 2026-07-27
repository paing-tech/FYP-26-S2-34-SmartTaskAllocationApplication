export const AGENT_AVATARS = [
  { key: "blue", src: "/optimusblue.png" },
  { key: "black", src: "/optimusblack.png" },
  { key: "red", src: "/optimusred.png" },
  { key: "sage", src: "/optimussage.png" },
];

export function getAgentAvatarSrc(key) {
  return AGENT_AVATARS.find((avatar) => avatar.key === key)?.src ?? AGENT_AVATARS[0].src;
}
