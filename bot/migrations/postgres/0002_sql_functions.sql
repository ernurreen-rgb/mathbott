-- Compatibility functions for the legacy repository's UTC date expressions.
-- Dates remain ISO text, matching SQLite and existing API response contracts.
CREATE FUNCTION mathbot_timestamp(value text) RETURNS timestamp
LANGUAGE plpgsql STABLE AS $$
BEGIN
    IF value = 'now' THEN
        RETURN statement_timestamp() AT TIME ZONE 'UTC';
    END IF;
    RETURN value::timestamptz AT TIME ZONE 'UTC';
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RETURN NULL;
END;
$$;

CREATE FUNCTION mathbot_datetime(value text, modifier text DEFAULT NULL) RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT to_char(mathbot_timestamp(value) + COALESCE(modifier::interval, interval '0 seconds'),
                   'YYYY-MM-DD HH24:MI:SS');
$$;

CREATE FUNCTION mathbot_datetime(value double precision, modifier text) RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT CASE WHEN modifier = 'unixepoch' THEN
        to_char(to_timestamp(value) AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') END;
$$;

CREATE FUNCTION mathbot_date(value text, modifier text DEFAULT NULL) RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT substring(mathbot_datetime(value, modifier) FROM 1 FOR 10);
$$;

CREATE FUNCTION mathbot_strftime(format text, value text) RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE result timestamp := mathbot_timestamp(value);
BEGIN
    IF format = '%w' THEN RETURN extract(dow FROM result)::integer::text;
    ELSIF format = '%H' THEN RETURN to_char(result, 'HH24');
    ELSIF format = '%s' THEN RETURN floor(extract(epoch FROM result))::bigint::text;
    ELSE RAISE EXCEPTION 'Unsupported strftime format: %', format;
    END IF;
END;
$$;

CREATE FUNCTION mathbot_julianday(value text) RETURNS double precision
LANGUAGE sql STABLE AS $$
    SELECT extract(epoch FROM mathbot_timestamp(value))::double precision / 86400.0 + 2440587.5;
$$;
