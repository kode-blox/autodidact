import Link from 'next/link';
import Image from 'next/image';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6">
        <Image src="/images/logo.svg" alt="" width={64} height={64} unoptimized className="size-16" />
        <div className="space-y-3">
          <p className="text-sm font-medium text-fd-muted-foreground">Self-hosted learning</p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">AutoDidact Docs</h1>
          <p className="mx-auto max-w-2xl text-balance text-lg text-fd-muted-foreground">
            Set up your reader, publish courses from Markdown, and see how AutoDidact saves your place and notes.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/self-hosting"
            className={buttonVariants({ variant: 'primary', className: 'h-10 px-4' })}
          >
            Get started
          </Link>
          <Link
            href="/architecture"
            className={buttonVariants({ variant: 'outline', className: 'h-10 px-4' })}
          >
            Understand the system
          </Link>
        </div>
      </div>
    </div>
  );
}
