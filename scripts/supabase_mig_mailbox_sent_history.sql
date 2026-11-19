-- Operator's sent-message history. Requires private_messages and event_operator.
BEGIN;
CREATE INDEX IF NOT EXISTS deck_private_messages_sender_idx
  ON public.deck_private_messages(sender_id,created_at DESC,id);
CREATE OR REPLACE FUNCTION public.mailbox_operator_sent(p_session text,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb; operator_id uuid;
BEGIN
  PERFORM public._event_operator_auth(p_session);
  operator_id := public._event_user();
  SELECT coalesce(jsonb_agg(public._mailbox_json(m,false) || jsonb_build_object('recipient_name',r.deck_name)
    ORDER BY m.created_at DESC,m.id),'[]') INTO result
  FROM (SELECT * FROM public.deck_private_messages WHERE sender_id=operator_id
    ORDER BY created_at DESC,id LIMIT 50 OFFSET greatest(0,coalesce(p_offset,0))) m
  JOIN public.rankings r ON r.id=m.recipient_id;
  PERFORM set_config('event.operator_id','',true);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.mailbox_operator_sent(text,integer) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mailbox_operator_sent(text,integer) TO anon,authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
