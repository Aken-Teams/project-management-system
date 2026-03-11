'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Mic, MicOff } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void
  onInterimTranscript?: (text: string) => void
  className?: string
}

export function VoiceInputButton({ onTranscript, onInterimTranscript, className }: VoiceInputButtonProps) {
  const [isListening, setIsListening] = useState(false)
  const [recognition, setRecognition] = useState<any>(null)
  const { toast } = useToast()

  useEffect(() => {
    // Check if browser supports speech recognition
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

      if (SpeechRecognition) {
        const recognitionInstance = new SpeechRecognition()
        recognitionInstance.continuous = true
        recognitionInstance.interimResults = true
        recognitionInstance.lang = 'zh-TW'

        recognitionInstance.onresult = (event: any) => {
          let finalTranscript = ''
          let interimTranscript = ''

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript
            if (event.results[i].isFinal) {
              finalTranscript += transcript
            } else {
              interimTranscript += transcript
            }
          }

          if (finalTranscript) {
            onTranscript(finalTranscript)
            onInterimTranscript?.('')
          } else if (interimTranscript) {
            onInterimTranscript?.(interimTranscript)
          }
        }

        recognitionInstance.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error)
          setIsListening(false)

          if (event.error === 'not-allowed') {
            toast({
              title: '麥克風權限被拒絕',
              description: '請允許瀏覽器使用麥克風',
              variant: 'destructive',
            })
          } else if (event.error === 'no-speech') {
            toast({
              title: '未偵測到語音',
              description: '請對著麥克風說話',
            })
          }
        }

        recognitionInstance.onend = () => {
          setIsListening(false)
          onInterimTranscript?.('')
        }

        setRecognition(recognitionInstance)
      }
    }

    return () => {
      if (recognition) {
        recognition.stop()
      }
    }
  }, [])

  const toggleListening = () => {
    if (!recognition) {
      toast({
        title: '不支援語音輸入',
        description: '您的瀏覽器不支援語音辨識功能',
        variant: 'destructive',
      })
      return
    }

    if (isListening) {
      recognition.stop()
      setIsListening(false)
    } else {
      recognition.start()
      setIsListening(true)
      toast({
        title: '開始語音輸入',
        description: '請對著麥克風說話...',
      })
    }
  }

  return (
    <Button
      type="button"
      variant={isListening ? 'destructive' : 'outline'}
      size="icon"
      onClick={toggleListening}
      className={className}
      title={isListening ? '停止語音輸入' : '開始語音輸入'}
    >
      {isListening ? (
        <MicOff className="h-4 w-4 animate-pulse" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </Button>
  )
}
