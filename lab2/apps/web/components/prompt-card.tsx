'use client'

import type { PromptDto, UserDto } from '@lab2/contract'
import { Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { downloadAttachment } from '@/lib/download'
import { describeError } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { canModifyPrompt } from '@/lib/prompt-permissions'

type PromptCardProps = {
  prompt: PromptDto
  user: UserDto
  onEdit: (prompt: PromptDto) => void
  onDelete: (prompt: PromptDto) => void
}

export function PromptCard({ prompt, user, onEdit, onDelete }: PromptCardProps) {
  const modifiable = canModifyPrompt(user, prompt)

  const handleDownload = () =>
    downloadAttachment(prompt).catch((error) => toast.error(describeError(error).message))

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="leading-snug">{prompt.title}</CardTitle>
          <Badge variant="secondary" className="uppercase">
            {prompt.model}
          </Badge>
        </div>
        <CardDescription>
          {prompt.author.name}, {formatDateTime(prompt.updatedAt)}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid flex-1 content-start gap-3">
        <p className="line-clamp-5 whitespace-pre-wrap text-sm text-muted-foreground">{prompt.body}</p>
        {prompt.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {prompt.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {prompt.attachment && (
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Paperclip />
            {prompt.attachment.name}
          </Button>
        )}
        {modifiable && (
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onEdit(prompt)}>
              Edit
            </Button>
            <Button variant="destructive" size="sm" onClick={() => onDelete(prompt)}>
              Delete
            </Button>
          </div>
        )}
      </CardFooter>
    </Card>
  )
}
