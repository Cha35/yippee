import Anthropic from '@anthropic-ai/sdk'
import type { Transaction, Member } from '../types'

export interface AiMatchResult {
  txId: string
  memberId: string | null
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

export async function matchTransactionsWithAI(
  apiKey: string,
  transactions: Transaction[],
  members: Member[]
): Promise<AiMatchResult[]> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const memberList = members
    .filter((m) => m.active)
    .map((m) => `- ID: ${m.id}, 이름: ${m.name}`)
    .join('\n')

  const txList = transactions
    .map((tx) => `- txId: ${tx.id}, 내용: "${tx.depositorName || tx.description}", 금액: ${tx.amount}원, 날짜: ${tx.date}`)
    .join('\n')

  const prompt = `아래는 팀 모임통장의 입금 거래 내역입니다. 각 거래의 "내용" 필드를 분석하여 어떤 팀원의 회비인지 매칭해주세요.

팀원 목록:
${memberList}

거래 내역:
${txList}

각 거래를 분석하여 JSON 배열로 응답해주세요. "내용" 필드에는 입금자 이름 + 회비 설명이 혼합되어 있습니다.
이름이 명확하지 않거나 팀원과 매칭되지 않으면 memberId를 null로 설정하세요.

응답 형식 (JSON만, 설명 없이):
[
  {
    "txId": "거래ID",
    "memberId": "팀원ID 또는 null",
    "confidence": "high|medium|low",
    "reason": "매칭 이유 (한국어, 20자 이내)"
  }
]`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')

  const jsonMatch = content.text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error('JSON 응답을 찾을 수 없습니다')

  return JSON.parse(jsonMatch[0]) as AiMatchResult[]
}
