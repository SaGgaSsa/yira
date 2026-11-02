import React from 'react'
import {
  Activity, Bug, BookOpen, Eye, History, MessageSquare, Search, Shield, Sparkles, Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { BOT_COLOR_HEX } from '@shared/bots'
import type { BotColorId, BotIconId } from '@shared/bots'

export const BOT_ICON_COMPONENTS: Record<BotIconId, LucideIcon> = {
  history: History,
  eye: Eye,
  activity: Activity,
  book: BookOpen,
  bug: Bug,
  search: Search,
  shield: Shield,
  sparkles: Sparkles,
  wrench: Wrench,
  message: MessageSquare,
}

interface BotAvatarProps {
  icon: BotIconId
  color: BotColorId
  size?: number
}

export function BotAvatar({ icon, color, size = 22 }: BotAvatarProps): React.ReactElement {
  const hex = BOT_COLOR_HEX[color]
  const Icon = BOT_ICON_COMPONENTS[icon]
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-md"
      style={{ width: size, height: size, backgroundColor: `${hex}2e`, color: hex }}
    >
      <Icon size={Math.round(size * 0.6)} aria-hidden="true" />
    </span>
  )
}
