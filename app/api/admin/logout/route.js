import { cookies } from 'next/headers';

export async function GET(request) {
  const cookieStore = await cookies();
  cookieStore.delete('admin_session');

  const loginUrl = new URL('/admin/login', request.url);
  return Response.redirect(loginUrl, 302);
}
