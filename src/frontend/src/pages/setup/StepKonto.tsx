import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

function pruefeDeIbanChecksum(iban: string) {
  const moved = iban.slice(4) + iban.slice(0, 4)
  let digits = ''

  for (const ch of moved) {
    digits += /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch
  }

  let rest = 0
  for (const ch of digits) {
    rest = (rest * 10 + Number(ch)) % 97
  }

  return rest === 1
}

async function ladeOpenIbanDaten(iban: string) {
  const res = await fetch(`https://openiban.com/validate/${encodeURIComponent(iban)}?getBIC=true`)
  if (!res.ok) throw new Error('OpenIBAN-Request fehlgeschlagen')
  return res.json() as Promise<{ valid: boolean; bankData?: { bic?: string; name?: string } }>
}

const OPEN_IBAN_BANK_FALLBACK = 'Bank konnte nicht automatisch ermittelt werden. Bitte gib sie manuell ein.'
const OPEN_IBAN_BIC_FALLBACK = 'BIC / SWIFT konnte nicht automatisch ermittelt werden. Bitte gib sie manuell ein.'

const schema = z.object({
  name:     z.string().min(1, 'Name ist erforderlich'),
  anbieter: z.string().min(1, 'Bank ist erforderlich'),
  kontoart: z.literal('bank'),
  iban: z
    .string()
    .min(1, 'IBAN ist erforderlich')
    .transform((v) => v.replace(/\s/g, '').toUpperCase())
    .superRefine((v, ctx) => {
      if (v.length < 15) {
        ctx.addIssue({ code: 'custom', message: 'Zu wenig Zeichen' })
        return
      }

      if (v.length > 34) {
        ctx.addIssue({ code: 'custom', message: 'Zu viele Zeichen' })
        return
      }

      if (v.startsWith('DE')) {
        if (v.length !== 22) {
          ctx.addIssue({ code: 'custom', message: v.length < 22 ? 'Zu wenig Zeichen' : 'Zu viele Zeichen' })
          return
        }

        if (!pruefeDeIbanChecksum(v)) {
          ctx.addIssue({ code: 'custom', message: 'Bitte gib eine gültige IBAN ein.' })
        }
      }
    }),
  bic:      z.string().optional(),
  kontotyp: z.enum(['geschaeftlich', 'mischkonto']),
})

type FormData = z.infer<typeof schema>

type Props = {
  onNext: (data: FormData) => void
  onBack: () => void
  isLoading?: boolean
}

export function StepKonto({ onNext, onBack, isLoading }: Props) {
  const { register, handleSubmit, setValue, getValues, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { kontoart: 'bank', kontotyp: 'geschaeftlich' },
  })

  const [bankFehler, setBankFehler] = useState<string | null>(null)
  const [bicFehler, setBicFehler] = useState<string | null>(null)

  async function handleBankLookup() {
    const iban = getValues('iban')?.replace(/\s/g, '').toUpperCase()
    if (!iban) return

    setBankFehler(null)
    setBicFehler(null)

    try {
      const data = await ladeOpenIbanDaten(iban)
      if (data.valid) {
        setValue('bic', data.bankData?.bic ?? '', { shouldDirty: true, shouldValidate: true })
        setValue('anbieter', data.bankData?.name ?? '', { shouldDirty: true, shouldValidate: true })
        return
      }
    } catch {
      // bewusst still: die lokale Validierung bleibt maßgeblich
    }

    setBankFehler(OPEN_IBAN_BANK_FALLBACK)
    setBicFehler(OPEN_IBAN_BIC_FALLBACK)
  }

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Gib dein Geschäftskonto an. Du kannst später weitere Konten hinzufügen.
      </p>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
          Kontobezeichnung <span className="text-red-500">*</span>
        </label>
        <input {...register('name')} placeholder="z.B. Geschäftskonto"
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400" />
        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
          Bank <span className="text-red-500">*</span>
        </label>
        <input {...register('anbieter')} placeholder="z.B. Sparkasse Berlin"
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400" />
        {errors.anbieter && <p className="text-red-500 text-xs mt-1">{errors.anbieter.message}</p>}
        {bankFehler && <p className="text-red-500 text-xs mt-1">{bankFehler}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
          IBAN <span className="text-red-500">*</span>
        </label>
        <input {...register('iban')} placeholder="DE44 2004 0060 0526 0120 00"
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400" />
        {errors.iban && <p className="text-red-500 text-xs mt-1">{errors.iban.message}</p>}
      </div>

      <button type="button" onClick={handleBankLookup}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900">
        <span>↗</span>
        <span>Bankname und BIC aus IBAN per Web</span>
      </button>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">BIC / SWIFT</label>
        <input {...register('bic')} placeholder="COBADEFFXXX"
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400" />
        {bicFehler && <p className="text-red-500 text-xs mt-1">{bicFehler}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Kontotyp</label>
        <div className="space-y-2">
          {[
            { value: 'geschaeftlich', label: 'Rein geschäftlich', desc: 'Alle Buchungen sind Betriebseinnahmen/-ausgaben.' },
            { value: 'mischkonto', label: 'Mischkonto', desc: 'Private und geschäftliche Buchungen werden getrennt klassifiziert.' },
          ].map(({ value, label, desc }) => (
            <label key={value} className="flex items-start gap-3 cursor-pointer">
              <input type="radio" {...register('kontotyp')} value={value}
                className="mt-0.5 h-4 w-4 border-slate-300 text-blue-600" />
              <div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
                <p className="text-xs text-slate-500 dark:text-slate-400">{desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="pt-2 flex justify-between">
        <button type="button" onClick={onBack}
          className="text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 font-medium px-4 py-2 rounded-lg transition-colors">
          ← Zurück
        </button>
        <button type="submit" disabled={isLoading}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-6 py-2 rounded-lg transition-colors">
          {isLoading ? 'Speichern...' : 'Einrichtung abschließen ✓'}
        </button>
      </div>
    </form>
  )
}
