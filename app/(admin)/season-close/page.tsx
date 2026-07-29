import { redirect } from 'next/navigation'

export default function SeasonCloseRedirect() {
  redirect('/season-close/summary')
}
