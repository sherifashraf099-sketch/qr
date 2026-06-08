import { cookies } from 'next/headers';

export async function POST(request) {
  const { password } = await request.json();

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return Response.json({ message: 'Wrong password.' }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set('admin_session', password, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });

  return Response.json({ message: 'Logged in.' });
}
