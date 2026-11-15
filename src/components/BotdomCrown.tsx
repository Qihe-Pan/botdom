import type { SVGProps } from "react";

export function BotdomCrown({ size = 12, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return <svg width={size} height={size} viewBox="20 2 24 14" fill="none" {...props}>
    <path d="M23 12.4 22 7.2c-.2-.9.8-1.4 1.5-.8l3.2 2.1 4.1-5.1c.6-.7 1.8-.7 2.4 0l4.1 5.1 3.2-2.1c.7-.6 1.7-.1 1.5.8l-1 5.2c-.1.6-.6 1-1.2 1H24.2c-.6 0-1.1-.4-1.2-1Z" fill="#ffca2e" />
  </svg>;
}
