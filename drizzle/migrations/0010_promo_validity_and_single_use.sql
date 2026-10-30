ALTER TABLE public.discount_codes
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS single_use boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS used_at timestamptz;

CREATE OR REPLACE FUNCTION public.validate_promo_dates()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (NEW.starts_at IS NULL) <> (NEW.ends_at IS NULL) THEN
    RAISE EXCEPTION 'Renseignez les deux dates ou aucune.';
  END IF;
  IF NEW.ends_at IS NOT NULL AND NEW.ends_at <= NEW.starts_at THEN
    RAISE EXCEPTION 'La fin doit être après le début.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS validate_promo_dates ON public.discount_codes;
CREATE TRIGGER validate_promo_dates BEFORE INSERT OR UPDATE ON public.discount_codes
FOR EACH ROW EXECUTE FUNCTION public.validate_promo_dates();

CREATE OR REPLACE FUNCTION public.consume_request_promo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  promo public.discount_codes%ROWTYPE;
  checked_at timestamptz;
BEGIN
  IF NEW.discount_code IS NULL OR btrim(NEW.discount_code) = '' THEN RETURN NEW; END IF;
  NEW.discount_code := upper(btrim(NEW.discount_code));
  SELECT * INTO promo FROM public.discount_codes WHERE code = NEW.discount_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROMO_INVALID'; END IF;
  checked_at := clock_timestamp();
  IF NOT promo.active
     OR (promo.starts_at IS NOT NULL AND checked_at < promo.starts_at)
     OR (promo.ends_at IS NOT NULL AND checked_at >= promo.ends_at)
     OR (promo.single_use AND promo.used_at IS NOT NULL) THEN
    RAISE EXCEPTION 'PROMO_INVALID';
  END IF;
  IF promo.single_use THEN
    UPDATE public.discount_codes SET used_at = checked_at WHERE code = promo.code;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_request_promo() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS consume_request_promo ON public.quote_requests;
CREATE TRIGGER consume_request_promo BEFORE INSERT ON public.quote_requests
FOR EACH ROW EXECUTE FUNCTION public.consume_request_promo();